/*
 Copyright (c) 2011-2014 Andrew Paprocki

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE
 */

// Modified from http://github.com/apaprocki/node-dhcpjs

"use strict";

var di = require('di');

module.exports = ParserFactory;

di.annotate(ParserFactory, new di.Provide('DHCP.parser'));
di.annotate(ParserFactory, new di.Inject('DHCP.protocol', 'Logger', 'Assert'));

function ParserFactory(protocol, Logger, assert) {
    return {
        logger: Logger.initialize(ParserFactory),
        len: null,

        trimNulls: function(str) {
            var idx = str.indexOf('\u0000');
            return (-1 === idx) ? str : str.substr(0, idx);
        },

        readIpRaw: function(msg, offset) {
            if (0 === msg.readUInt8(offset) || msg.length < 4) {
                return undefined;
            }

            return '' +
                msg.readUInt8(offset++) + '.' +  // jshint ignore:line
                msg.readUInt8(offset++) + '.' +  // jshint ignore:line
                msg.readUInt8(offset++) + '.' +  // jshint ignore:line
                msg.readUInt8(offset++);         // jshint ignore:line
        },

        readIp: function(msg, offset, name) {
            this.len = msg.readUInt8(offset);
            offset += 1;

            assert.strictEqual(this.len, 4);
            this.packet.options[name] = this.readIpRaw(msg, offset);
            offset += this.len;

            return offset;
        },

        readString: function(msg, offset, name) {
            this.len = msg.readUInt8(offset);
            offset += 1;
            this.packet.options[name] = msg.toString('ascii', offset, offset + this.len);
            offset += this.len;
            return offset;
        },

        readAddressRaw: function(msg, offset, len) {
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
        },

        parse: function(msg) {
            this.len = null;

            var unhandledOptions = [],
                offset = 240,
                code = 0;

            //This will throw an error if the msg is less than the offset of 240
            this.packet = {
                op: protocol.BOOTPMessageType.get(msg.readUInt8(0)),
                // htype is combined into chaddr field object
                hlen: msg.readUInt8(2),
                hops: msg.readUInt8(3),
                xid: msg.readUInt32BE(4),
                secs: msg.readUInt16BE(8),
                flags: msg.readUInt16BE(10),
                ciaddr: this.readIpRaw(msg, 12),
                yiaddr: this.readIpRaw(msg, 16),
                siaddr: this.readIpRaw(msg, 20),
                giaddr: this.readIpRaw(msg, 24),
                chaddr: protocol.createHardwareAddress(
                    protocol.ARPHardwareType.get(msg.readUInt8(1)),
                    this.readAddressRaw(msg, 28, msg.readUInt8(2))),
                sname: this.trimNulls(msg.toString('ascii', 44, 108)),
                fname: this.trimNulls(msg.toString('ascii', 108, 236)),
                magic: msg.readUInt32BE(236),
                options: {}
            };


            // NOTE: DO NOT CHANGE TO !==
            while (code != 255 && offset < msg.length) {  // jshint ignore:line

                code = msg.readUInt8(offset);
                offset += 1;
                switch (code) {
                    case 0: continue;   // pad
                    case 255: break;    // end
                    case 1: {           // subnetMask
                        offset = this.readIp(msg, offset, 'subnetMask');
                        break;
                    }
                    case 2: {           // timeOffset
                        this.len = msg.readUInt8(offset);
                        offset += 1;
                        assert.strictEqual(this.len, 4);
                        this.packet.options.timeOffset = msg.readUInt32BE(offset);
                        offset += this.len;
                        break;
                    }
                    case 3: {           // routerOptions
                        this.len = msg.readUInt8(offset);
                        offset += 1;
                        assert.strictEqual(this.len % 4, 0);
                        this.packet.options.routerOptions = [];
                        while (this.len > 0) {
                            this.packet.options.routerOptions.push(this.readIpRaw(msg, offset));
                            offset += 4;
                            this.len -= 4;
                        }
                        break;
                    }
                    case 4: {           // timeServerOption
                        this.len = msg.readUInt8(offset);
                        offset += 1;
                        assert.strictEqual(this.len % 4, 0);
                        this.packet.options.timeServerOption = [];
                        while (this.len > 0) {
                            this.packet.options.timeServerOption.push(this.readIpRaw(msg, offset));
                            offset += 4;
                            this.len -= 4;
                        }
                        break;
                    }
                    case 6: {           // domainNameServerOption
                        this.len = msg.readUInt8(offset);
                        offset += 1;
                        assert.strictEqual(this.len % 4, 0);
                        this.packet.options.domainNameServerOption = [];
                        while (this.len > 0) {
                            this.packet.options.domainNameServerOption.push(
                                this.readIpRaw(msg, offset));
                            offset += 4;
                            this.len -= 4;
                        }
                        break;
                    }
                    case 12: {          // hostName
                        offset = this.readString(msg, offset, 'hostName');
                        break;
                    }
                    case 15: {          // domainName
                        offset = this.readString(msg, offset, 'domainName');
                        break;
                    }
                    case 28: {          // broadcastAddress
                        offset = this.readIp(msg, offset, 'broadcastAddress');
                        break;
                    }
                    case 43: {          // vendorOptions
                        this.len = msg.readUInt8(offset);
                        offset += 1;
                        this.packet.options.vendorOptions = {};
                        while (this.len > 0) {
                            var vendop = msg.readUInt8(offset);
                            offset += 1;
                            var vendoplen = msg.readUInt8(offset);
                            offset += 1;
                            var buf = new Buffer(vendoplen);
                            msg.copy(buf, 0, offset, offset + vendoplen);
                            this.packet.options.vendorOptions[vendop] = buf;
                            this.len -= 2 + vendoplen;
                            offset += vendoplen;
                        }
                        break;
                    }
                    case 50: {          // requestedIpAddress
                        offset = this.readIp(msg, offset, 'requestedIpAddress');
                        break;
                    }
                    case 51: {          // ipAddressLeaseTime
                        this.len = msg.readUInt8(offset);
                        offset += 1;
                        assert.strictEqual(this.len, 4);
                        this.packet.options.ipAddressLeaseTime =
                            msg.readUInt32BE(offset);
                        offset += 4;
                        break;
                    }
                    case 52: {          // optionOverload
                        this.len = msg.readUInt8(offset);
                        offset += 1;
                        assert.strictEqual(this.len, 1);
                        this.packet.options.optionOverload = msg.readUInt8(offset);
                        offset += 1;
                        break;
                    }
                    case 53: {          // dhcpMessageType
                        this.len = msg.readUInt8(offset);
                        offset += 1;
                        assert.strictEqual(this.len, 1);
                        var mtype = msg.readUInt8(offset);
                        offset += 1;
                        assert.ok(1 <= mtype);
                        assert.ok(8 >= mtype);
                        this.packet.options.dhcpMessageType = protocol.DHCPMessageType.get(mtype);
                        break;
                    }
                    case 54: {          // serverIdentifier
                        offset = this.readIp(msg, offset, 'serverIdentifier');
                        break;
                    }
                    case 55: {          // parameterRequestList
                        this.len = msg.readUInt8(offset);
                        offset += 1;
                        this.packet.options.parameterRequestList = [];
                        while (this.len-- > 0) {  // jshint ignore:line
                            var option = msg.readUInt8(offset);
                            offset += 1;
                            this.packet.options.parameterRequestList.push(option);
                        }
                        break;
                    }
                    case 57: {          // maximumMessageSize
                        this.len = msg.readUInt8(offset);
                        offset += 1;
                        assert.strictEqual(this.len, 2);
                        this.packet.options.maximumMessageSize = msg.readUInt16BE(offset);
                        offset += this.len;
                        break;
                    }
                    case 58: {          // renewalTimeValue
                        this.len = msg.readUInt8(offset);
                        offset += 1;
                        assert.strictEqual(this.len, 4);
                        this.packet.options.renewalTimeValue = msg.readUInt32BE(offset);
                        offset += this.len;
                        break;
                    }
                    case 59: {          // rebindingTimeValue
                        this.len = msg.readUInt8(offset);
                        offset += 1;
                        assert.strictEqual(this.len, 4);
                        this.packet.options.rebindingTimeValue = msg.readUInt32BE(offset);
                        offset += this.len;
                        break;
                    }
                    case 60: {          // vendorClassIdentifier
                        offset = this.readString(msg, offset, 'vendorClassIdentifier');
                        break;
                    }
                    case 61: {          // clientIdentifier
                        this.len = msg.readUInt8(offset);
                        offset += 1;
                        this.packet.options.clientIdentifier =
                            protocol.createHardwareAddress(
                                protocol.ARPHardwareType.get(msg.readUInt8(offset)),
                                this.readAddressRaw(msg, offset + 1, this.len - 1));
                        offset += this.len;
                        break;
                    }
                    case 67: {          // bootFileName
                        offset = this.readString(msg, offset, 'bootFileName');
                        break;
                    }
                    case 77: {
                        offset = this.readString(msg, offset, 'userClass');
                        break;
                    }
                    case 81: {          // fullyQualifiedDomainName
                        this.len = msg.readUInt8(offset);
                        offset += 1;
                        this.packet.options.fullyQualifiedDomainName = {
                            flags: msg.readUInt8(offset),
                            name: msg.toString('ascii', offset + 3, offset + this.len)
                        };
                        offset += this.len;
                        break;
                    }
                    case 93: {          // system architecture
                        this.len = msg.readUInt8(offset);
                        offset += 1;
                        assert.strictEqual(this.len, 2);
                        this.packet.options.archType = msg.readUInt16BE(offset);
                        offset += this.len;
                        break;
                    }
                    case 118: {         // subnetSelection
                        offset = this.readIp(msg, offset, 'subnetAddress');
                        break;
                    }
                    default: {
                        this.len = msg.readUInt8(offset);
                        offset += 1;
                        unhandledOptions.push({ code: code, len: this.len });
                        offset += this.len;
                        break;
                    }
                }
            }

            if (unhandledOptions.length) {
                this.logger.debug('Unhandled DHCP options (' +
                    unhandledOptions.map(function (option) {
                    return option.code + ':' + option.len;
                }).join() + ')', {
                    macaddress: this.packet.chaddr.address.toString()
                });
            }

            return this.packet;
        }
    };
}
