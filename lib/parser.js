// Copyright 2015, Renasar Technologies Inc.
// Modified from http://github.com/apaprocki/node-dhcpjs
/* jshint node: true */

"use strict";

var di = require('di');

module.exports = function(logger) {
    var assert = require('assert');
    var protocol = require('./dhcp-protocol');
    var parser = {};

    parser.parse = function(msg) {
        function trimNulls(str) {
            var idx = str.indexOf('\u0000');
            return (-1 === idx) ? str : str.substr(0, idx);
        }
        function readIpRaw(msg, offset) {
            if (0 === msg.readUInt8(offset)) {
                return undefined;
            }
            return '' +
                msg.readUInt8(offset++) + '.' +  // jshint ignore:line
                msg.readUInt8(offset++) + '.' +  // jshint ignore:line
                msg.readUInt8(offset++) + '.' +  // jshint ignore:line
                msg.readUInt8(offset++);         // jshint ignore:line
        }
        function readIp(msg, offset, obj, name) {
            len = msg.readUInt8(offset);
            offset += 1;
            assert.strictEqual(len, 4);
            p.options[name] = readIpRaw(msg, offset);
            return offset + len;
        }
        function readString(msg, offset, obj, name) {
            len = msg.readUInt8(offset);
            offset += 1;
            p.options[name] = msg.toString('ascii', offset, offset + len);
            offset += len;
            return offset;
        }
        function readAddressRaw(msg, offset, len) {
            var addr = '';
            while (len-- > 0) {  // jshint ignore:line
                var b = msg.readUInt8(offset);
                offset += 1;
                addr += (b + 0x100).toString(16).substr(-2);
                if (len > 0) {
                    addr += ':';
                }
            }
            return addr;
        }
        //logger.info(rinfo.address + ':' + rinfo.port + '/' + msg.length + 'b');
        var p = {
            op: protocol.BOOTPMessageType.get(msg.readUInt8(0)),
            // htype is combined into chaddr field object
            hlen: msg.readUInt8(2),
            hops: msg.readUInt8(3),
            xid: msg.readUInt32BE(4),
            secs: msg.readUInt16BE(8),
            flags: msg.readUInt16BE(10),
            ciaddr: readIpRaw(msg, 12),
            yiaddr: readIpRaw(msg, 16),
            siaddr: readIpRaw(msg, 20),
            giaddr: readIpRaw(msg, 24),
            chaddr: protocol.createHardwareAddress(
                protocol.ARPHardwareType.get(msg.readUInt8(1)),
                readAddressRaw(msg, 28, msg.readUInt8(2))),
            sname: trimNulls(msg.toString('ascii', 44, 108)),
            fname: trimNulls(msg.toString('ascii', 108, 236)),
            magic: msg.readUInt32BE(236),
            options: {}
        };
        var offset = 240;
        var code = 0;

        var unhandledOptions = [];

        // NOTE: DO NOT CHANGE TO !==
        while (code != 255 && offset < msg.length) {  // jshint ignore:line
            code = msg.readUInt8(offset);
            offset += 1;
            var len;
            switch (code) {
                case 0: continue;   // pad
                case 255: break;    // end
                case 1: {           // subnetMask
                    offset = readIp(msg, offset, p, 'subnetMask');
                    break;
                }
                case 2: {           // timeOffset
                    len = msg.readUInt8(offset);
                    offset += 1;
                    assert.strictEqual(len, 4);
                    p.options.timeOffset = msg.readUInt32BE(offset);
                    offset += len;
                    break;
                }
                case 3: {           // routerOptions
                    len = msg.readUInt8(offset);
                    offset += 1;
                    assert.strictEqual(len % 4, 0);
                    p.options.routerOptions = [];
                    while (len > 0) {
                        p.options.routerOptions.push(readIpRaw(msg, offset));
                        offset += 4;
                        len -= 4;
                    }
                    break;
                }
                case 4: {           // timeServerOption
                    len = msg.readUInt8(offset);
                    offset += 1;
                    assert.strictEqual(len % 4, 0);
                    p.options.timeServerOption = [];
                    while (len > 0) {
                        p.options.timeServerOption.push(readIpRaw(msg, offset));
                        offset += 4;
                        len -= 4;
                    }
                    break;
                }
                case 6: {           // domainNameServerOption
                    len = msg.readUInt8(offset);
                    offset += 1;
                    assert.strictEqual(len % 4, 0);
                    p.options.domainNameServerOption = [];
                    while (len > 0) {
                        p.options.domainNameServerOption.push(
                            readIpRaw(msg, offset));
                        offset += 4;
                        len -= 4;
                    }
                    break;
                }
                case 12: {          // hostName
                    offset = readString(msg, offset, p, 'hostName');
                    break;
                }
                case 15: {          // domainName
                    offset = readString(msg, offset, p, 'domainName');
                    break;
                }
                case 28: {          // broadcastAddress
                    offset = readIp(msg, offset, p, 'broadcastAddress');
                    break;
                }
                case 43: {          // vendorOptions
                    len = msg.readUInt8(offset);
                    offset += 1;
                    p.options.vendorOptions = {};
                    while (len > 0) {
                        var vendop = msg.readUInt8(offset);
                        offset += 1;
                        var vendoplen = msg.readUInt8(offset);
                        offset += 1;
                        var buf = new Buffer(vendoplen);
                        msg.copy(buf, 0, offset, offset + vendoplen);
                        p.options.vendorOptions[vendop] = buf;
                        len -= 2 + vendoplen;
                    }
                    break;
                }
                case 50: {          // requestedIpAddress
                    offset = readIp(msg, offset, p, 'requestedIpAddress');
                    break;
                }
                case 51: {          // ipAddressLeaseTime
                    len = msg.readUInt8(offset);
                    offset += 1;
                    assert.strictEqual(len, 4);
                    p.options.ipAddressLeaseTime =
                        msg.readUInt32BE(offset);
                    offset += 4;
                    break;
                }
                case 52: {          // optionOverload
                    len = msg.readUInt8(offset);
                    offset += 1;
                    assert.strictEqual(len, 1);
                    p.options.optionOverload = msg.readUInt8(offset);
                    offset += 1;
                    break;
                }
                case 53: {          // dhcpMessageType
                    len = msg.readUInt8(offset);
                    offset += 1;
                    assert.strictEqual(len, 1);
                    var mtype = msg.readUInt8(offset);
                    offset += 1;
                    assert.ok(1 <= mtype);
                    assert.ok(8 >= mtype);
                    p.options.dhcpMessageType = protocol.DHCPMessageType.get(mtype);
                    break;
                }
                case 54: {          // serverIdentifier
                    offset = readIp(msg, offset, p, 'serverIdentifier');
                    break;
                }
                case 55: {          // parameterRequestList
                    len = msg.readUInt8(offset);
                    offset += 1;
                    p.options.parameterRequestList = [];
                    while (len-- > 0) {  // jshint ignore:line
                        var option = msg.readUInt8(offset);
                        offset += 1;
                        p.options.parameterRequestList.push(option);
                    }
                    break;
                }
                case 57: {          // maximumMessageSize
                    len = msg.readUInt8(offset);
                    offset += 1;
                    assert.strictEqual(len, 2);
                    p.options.maximumMessageSize = msg.readUInt16BE(offset);
                    offset += len;
                    break;
                }
                case 58: {          // renewalTimeValue
                    len = msg.readUInt8(offset);
                    offset += 1;
                    assert.strictEqual(len, 4);
                    p.options.renewalTimer = msg.readUInt32BE(offset);
                    offset += len;
                    break;
                }
                case 59: {          // rebindingTimeValue
                    len = msg.readUInt8(offset);
                    offset += 1;
                    assert.strictEqual(len, 4);
                    p.options.rebindingTimer = msg.readUInt32BE(offset);
                    offset += len;
                    break;
                }
                case 60: {          // vendorClassIdentifier
                    offset = readString(msg, offset, p, 'vendorClassIdentifier');
                    break;
                }
                case 61: {          // clientIdentifier
                    len = msg.readUInt8(offset);
                    offset += 1;
                    p.options.clientIdentifier =
                        protocol.createHardwareAddress(
                            protocol.ARPHardwareType.get(msg.readUInt8(offset)),
                            readAddressRaw(msg, offset + 1, len - 1));
                    offset += len;
                    break;
                }
                case 67: {          // bootFileName
                    offset = readString(msg, offset, p, 'bootFileName');
                    break;
                }
                case 77: {
                    offset = readString(msg, offset, p, 'userClass');
                    break;
                }
                case 81: {          // fullyQualifiedDomainName
                    len = msg.readUInt8(offset);
                    offset += 1;
                    p.options.fullyQualifiedDomainName = {
                        flags: msg.readUInt8(offset),
                        name: msg.toString('ascii', offset + 3, offset + len)
                    };
                    offset += len;
                    break;
                }
                case 118: {		    // subnetSelection
                    offset = readIp(msg, offset, p, 'subnetAddress');
                    break;
                }
                default: {
                    len = msg.readUInt8(offset);
                    offset += 1;
                    unhandledOptions.push({ code: code, len: len });
                    offset += len;
                    break;
                }
            }
        }

        if (unhandledOptions.length) {
            logger.silly('Unhandled DHCP options (' + unhandledOptions.map(function (option) {
                return option.code + ':' + option.len;
            }).join() + ')', {
                macaddress: p.chaddr.address.toString()
            });
        }

        return p;
    };

    return parser;
};

di.annotate(module.exports, new di.Provide('DHCP.parser'));
