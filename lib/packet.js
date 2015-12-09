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

var di = require('di'),
    v4 = require('ipv6').v4;

module.exports = PacketFactory;
di.annotate(PacketFactory, new di.Provide('DHCP.packet'));
di.annotate(PacketFactory, new di.Inject('DHCP.protocol', 'Services.Configuration', '_'));
function PacketFactory(protocol, configuration, _) {
    var packetFunctions = {
        // Expose this for test
        createPacketBuffer: createPacketBuffer,
        createProxyDhcpAck: function(clientPacket, bootFileName) {
            var packet = {};
            var isPXEefi = false;
            _.forEach(clientPacket, function(value, key) {
                packet[key] = value;
            });
            packet.op = protocol.BOOTPMessageType.BOOTPREPLY.value;
            packet.htype = protocol.ARPHardwareType.HW_ETHERNET.value;
            packet.fname = bootFileName;

            // Necessary, at least on vbox
            packet.siaddr = configuration.get('dhcpGateway', '10.1.1.1');
            // Not necessary, at least on vbox, but perhaps other clients will require these fields?
            packet.sname = configuration.get('dhcpGateway', '10.1.1.1');

            //EFI PXE listen on a different port => tell the server
            if ((packet.options.userClass === undefined) &&
               (packet.options.archType === 6 || // EFI32
                packet.options.archType === 7 || packet.options.archType === 9)) { // EFIx64
                isPXEefi = true;
            }
            packet.options = {};
            //EFI pxe use option 67 for bootfilename.
            //Since option 67 doesn't include a field for string length,
            //bootfilname needs to be null-terminated
            packet.options.bootFileName = bootFileName + '\0';

            // DHCP MESSAGE TYPES
            packet.options.dhcpMessageType =
                protocol.DHCPMessageType.DHCPACK.value;

            var packetBuffer = packetFunctions.createPacketBuffer(packet);
            return {
                packetBuffer: packetBuffer,
                destination: packet.ciaddr,
                isefi : isPXEefi
            };
        }
    };

    return packetFunctions;
}

// Modified from http://github.com/apaprocki/node-dhcpjs
function createPacketBuffer(pkt) {
    if (!('xid' in pkt)) {
        throw new Error('pkt.xid required');
    }

    // client ip address
    var ci = new Buffer(pkt.ciaddr ?
        new v4.Address(pkt.ciaddr).toArray() : [0, 0, 0, 0]);
    // your ip address
    var yi = new Buffer(pkt.yiaddr ?
        new v4.Address(pkt.yiaddr).toArray() : [0, 0, 0, 0]);
    // server ip address
    var si = new Buffer(pkt.siaddr ?
        new v4.Address(pkt.siaddr).toArray() : [0, 0, 0, 0]);
    // gateway ip address
    var gi = new Buffer(pkt.giaddr ?
        new v4.Address(pkt.giaddr).toArray() : [0, 0, 0, 0]);
    // Right now just assume we always have an IP as the server hostname
    // server hostname
    var sname = new Buffer(pkt.sname ? pkt.sname : '');
    // boot file name
    var fname = new Buffer(pkt.fname ? pkt.fname : '');

    if (!('chaddr' in pkt)) {
        throw new Error('pkt.chaddr required');
    }
    if (sname.length > 64) {
        throw new Error('sname field too long (64 bytes max): ' + sname.toString());
    }
    if (fname.length > 128) {
        throw new Error('fname field too long (128 bytes max): ' + fname.toString());
    }
    var hw;
    // If this is coming from a client, it's a string
    if (typeof pkt.chaddr === 'string') {
        hw = new Buffer(pkt.chaddr.split(':').map(function (part) {
            return parseInt(part, 16);
        }));
        // If this is coming from the server, it's an object
    } else {
        hw = new Buffer(pkt.chaddr.address.split(':').map(function (part) {
            return parseInt(part, 16);
        }));
    }
    if (hw.length !== 6) {
        throw new Error('pkt.chaddr malformed, only ' + hw.length + ' bytes');
    }

    var p = new Buffer(1500);
    var i = 0;

    p.writeUInt8(pkt.op || 0, i);
    i += 1;
    p.writeUInt8(pkt.htype || 0, i);
    i += 1;
    p.writeUInt8(pkt.hlen || 0, i);
    i += 1;
    p.writeUInt8(pkt.hops || 0, i);
    i += 1;
    p.writeUInt32BE(pkt.xid || 0, i);
    i += 4;
    p.writeUInt16BE(pkt.secs || 0, i);
    i += 2;
    p.writeUInt16BE(pkt.flags || 0, i);
    i += 2;
    ci.copy(p, i);
    i += ci.length;
    yi.copy(p, i);
    i += yi.length;
    si.copy(p, i);
    i += si.length;
    gi.copy(p, i);
    i += gi.length;
    hw.copy(p, i);
    i += hw.length;
    p.fill(0, i, i + 10);
    i += 10; // hw address padding

    sname.copy(p, i);
    i += sname.length;
    p.fill(0, i, i + 64 - sname.length); // fill in the rest of the sname padding
    i += 64 - sname.length;
    // TODO: Only add if option overload
    //p.writeUInt8(255, i);
    //i += 1;

    fname.copy(p, i);
    i += fname.length;
    p.fill(0, i, i + 128 - sname.length); // fill in the rest of the fname padding
    i += 128 - fname.length;
    // TODO: Only add if option overload
    //p.writeUInt8(255, i);
    //i += 1;

    p.writeUInt32BE(0x63825363, i);
    i += 4;

    if (pkt.options && pkt.options.subnetMask) {
        p.writeUInt8(1, i);
        i += 1; // option 1
        var subnetMask = new Buffer(
            new v4.Address(pkt.options.subnetMask).toArray());
        p.writeUInt8(subnetMask.length, i);
        i += 1;
        subnetMask.copy(p, i);
        i += subnetMask.length;
    }
    if (pkt.options && pkt.options.routerOptions) {
        p.writeUInt8(3, i);
        i += 1; // option 3
        // If routerOptions is not an array by human error,
        // it's probably a string and we should just make it an array.
        var routerOptions = pkt.options.routerOptions;
        if (typeof routerOptions !== 'object') {
            routerOptions = [routerOptions];
        }
        // Let's hope routerOptions.length * 4 can fit in one byte :)
        // To quote Joe: "probably OSPF would blow up before that!"
        p.writeUInt8(routerOptions.length * 4, i);
        i += 1;
        routerOptions.forEach(function (router) {
            var routerBuffer = new Buffer(
                new v4.Address(router).toArray());
            routerBuffer.copy(p, i);
            i += routerBuffer.length;
        });
    }
    if (pkt.options && pkt.options.broadcastAddress) {
        p.writeUInt8(28, i);
        i += 1; // option 28
        var broadcastAddress = new Buffer(
            new v4.Address(pkt.options.broadcastAddress).toArray());
        p.writeUInt8(broadcastAddress.length, i);
        i += 1; // length
        broadcastAddress.copy(p, i);
        i += broadcastAddress.length;
    }
    if (pkt.options && pkt.options.requestedIpAddress) {
        p.writeUInt8(50, i);
        i += 1;  // option 50
        var requestedIpAddress = new Buffer(
            new v4.Address(pkt.options.requestedIpAddress).toArray());
        p.writeUInt8(requestedIpAddress.length, i);
        i += 1; // length
        requestedIpAddress.copy(p, i);
        i += requestedIpAddress.length;
    }
    if (pkt.options && pkt.options.ipAddressLeaseTime) {
        p.writeUInt8(51, i);
        i += 1; // option 51
        p.writeUInt8(4, i);
        i += 1; // length
        p.writeUInt32BE(pkt.options.ipAddressLeaseTime, i);
        i += 4;
    }
    if (pkt.options && pkt.options.optionOverload) {
        p.writeUInt8(52, i);
        i += 1; // option 52
        p.writeUInt8(1, i);
        i += 1; // length
        p.writeUInt8(pkt.options.optionOverload, i);
        i += 1;
    }
    if (pkt.options && pkt.options.dhcpMessageType) {
        p.writeUInt8(53, i);
        i += 1; // option 53
        p.writeUInt8(1, i);
        i += 1;  // length

        if(typeof pkt.options.dhcpMessageType === 'object'){
            p.writeUInt8(pkt.options.dhcpMessageType.value, i);
        }
        else{
            p.writeUInt8(pkt.options.dhcpMessageType, i);
        }
        i += 1;
    }
    if (pkt.options && pkt.options.serverIdentifier) {
        p.writeUInt8(54, i);
        i += 1; // option 54
        var serverIdentifier = new Buffer(
            new v4.Address(pkt.options.serverIdentifier).toArray());
        p.writeUInt8(serverIdentifier.length, i);
        i += 1;
        serverIdentifier.copy(p, i);
        i += serverIdentifier.length;
    }
    if (pkt.options && pkt.options.parameterRequestList) {
        p.writeUInt8(55, i);
        i += 1; // option 55
        var parameterRequestList = new Buffer(pkt.options.parameterRequestList);
        if (parameterRequestList.length > 0xff) {
            throw new Error('pkt.options.parameterRequestList malformed');
        }
        p.writeUInt8(parameterRequestList.length, i);
        i += 1;
        parameterRequestList.copy(p, i);
        i += parameterRequestList.length;
    }
    if (pkt.options && pkt.options.renewalTimeValue) {
        p.writeUInt8(58, i);
        i += 1; // option 58
        p.writeUInt8(4, i);
        i += 1; // length
        p.writeUInt32BE(pkt.options.renewalTimeValue, i);
        i += 4;
    }
    if (pkt.options && pkt.options.rebindingTimeValue) {
        p.writeUInt8(59, i);
        i += 1; // option 59
        p.writeUInt8(4, i);
        i += 1; // length
        p.writeUInt32BE(pkt.options.rebindingTimeValue, i);
        i += 4;
    }
    if (pkt.options && pkt.options.vendorClassIdentifier) {
        p.writeUInt8(60, i);
        i += 1; // option 60
        var vendorClassIdentifier =
            new Buffer(pkt.options.vendorClassIdentifier);
        p.writeUInt8(vendorClassIdentifier.length, i);
        i += 1;
        vendorClassIdentifier.copy(p, i);
        i += vendorClassIdentifier.length;
    }
    if (pkt.options && pkt.options.clientIdentifier) {
        var clientIdentifier = new Buffer(pkt.options.clientIdentifier);
        var optionLength = 1 + clientIdentifier.length;
        if (optionLength > 0xff) {
            throw new Error('pkt.options.clientIdentifier malformed');
        }
        p.writeUInt8(61, i);
        i += 1;           // option 61
        p.writeUInt8(optionLength, i);
        i += 1; // length
        p.writeUInt8(0, i);
        i += 1;            // hardware type 0
        clientIdentifier.copy(p, i);
        i += clientIdentifier.length;
    }
    if (pkt.options && pkt.options.bootFileName) {
        p.writeUInt8(67, i);
        i += 1; // option 67
        var bootFileName = new Buffer(pkt.options.bootFileName);
        p.writeUInt8(bootFileName.length, i);
        i += 1;
        bootFileName.copy(p, i);
        i += bootFileName.length;
    }

    // option 255 - end
    p.writeUInt8(0xff, i);
    i += 1;

    // padding
    if ((i % 2) > 0) {
        p.writeUInt8(0, i);
        i += 1;
    } else {
        p.writeUInt16BE(0, i);
        i += 1;
    }

    var remaining = 300 - i;
    if (remaining > 0) {
        p.fill(0, i, i + remaining);
        i += remaining;
    }

    return p.slice(0, i);
}
