// Copyright 2015, EMC, Inc.
/* jshint node: true */

"use strict";

describe("Parser", function() {

    var parser;
    var packetDHCP;
    var msg;
    var offset;

    before('Parser before', function() {
        helper.setupInjector(
            [
                helper.require('/lib/parser'),
                helper.require('/lib/dhcp-protocol'),
                helper.require('/lib/packet'),
                helper.require('/lib/message-handler'),
            ]
        );
        var Logger = helper.injector.get('Logger');
        Logger.prototype.log = sinon.stub();
        parser = helper.injector.get('DHCP.parser');
        packetDHCP = helper.injector.get('DHCP.packet');
    });

    describe('trimNulls Function', function() {

        it("should trim the null from the string", function() {
            expect(parser.trimNulls("string with null \u0000000100020003"))
                .to.not.contains("\u0000");
        });

        it("should not trim the string if there is no null", function() {
            expect(parser.trimNulls("string with not null 0000"))
                .to.equal("string with not null 0000");
        });

    });

    describe('readIpRaw Function', function() {
        it("should return undefined if the msg offset is 0", function() {
            msg = new Buffer(2);
            offset = 0;
            msg[0] = 0x0;

            expect(parser.readIpRaw(msg, offset)).to.be.an('undefined');
        });

        it("should return the msg as a string seperated by \'.\'", function() {
            msg = new Buffer(4);
            offset = 0;
            msg[0] = 0x3;
            msg[1] = 0x4;
            msg[2] = 0x5;
            msg[3] = 0x6;

            expect(parser.readIpRaw(msg, offset)).to.be.equal("3.4.5.6");
        });

        it("should return undefined if the offset is not 4 or greater", function() {
            var msg = new Buffer(3);
            var offset = 0;
            msg[0] = 0x3;
            msg[1] = 0x4;
            msg[2] = 0x5;

            expect(parser.readIpRaw(msg, offset)).to.be.an('undefined');
        });
    });

    describe('ReadIp Function', function() {
        beforeEach("ReadIp beforeEach", function() {
            msg = new Buffer(3);
            offset = 0;
            msg[0] = 0x4;

            parser.packet = {
                options: {}
            };
        });

        it("should return the offset plus the len and update the packet options names", function() {
            var len = msg.readUInt8(offset);

            expect(parser.readIp(msg, offset, "test_name")).to.equal(offset+len+1);
        });

        it("should throw assert false if the length does not equal 4", function() {
            expect(function() {
                msg[0] = 0x3;

                parser.readIp(msg, offset, "test_name");
            }).to.throw(Error, '3 === 4');
        });

        it("should update the packet options names", function(){
            var len = msg.readUInt8(offset);

            expect(parser.readIp(msg, offset, "test_name")).to.equal(offset+len+1);
            expect(parser.packet.options).to.include.keys("test_name");
        });
    });

    describe('ReadString Function', function() {

        beforeEach("ReadString beforeEach", function() {
            msg = new Buffer(3);
            offset = 0;
            msg[0] = 0x3;

            parser.packet = {
                options: {}
            };
        });

        it("should return the offset and update the packet options names", function() {
            var len = msg.readUInt8(offset);

            expect(parser.readString(msg, offset, "test_name")).to.equal(offset+len+1);
        });

        it("should update the packet options names", function(){
            var len = msg.readUInt8(offset);

            expect(parser.readString(msg, offset, "test_name")).to.equal(offset+len+1);
            expect(parser.packet.options).to.include.keys("test_name");
        });

    });


    describe('readAddressRaw Function', function() {

        it("should return the address when the length is equal to or less than 0", function() {
            var msg = "";
            var offset = 0;

            var address = parser.readAddressRaw(msg, offset, 0);
            expect(address).to.be.empty;
        });

        it("should return the address when the length is greater 0 it will " +
            "add a \':\' to the address", function() {
            msg = new Buffer(2);
            var offset = 0;
            msg[0] = 0x3;
            msg[1] = 0x4;

            var address = parser.readAddressRaw(msg, offset, 2);
            expect(address).to.contain(":");
            expect(address.length).to.be.above(0);
        });

        it("should return the address as a valid IPaddress", function() {
            msg = new Buffer(6);
            var offset = 0;
            msg[0] = 0x13;
            msg[1] = 0x14;
            msg[2] = 0x34;
            msg[3] = 0x24;
            msg[4] = 0x11;
            msg[5] = 0xff;

            var address = parser.readAddressRaw(msg, offset, msg.length);
            expect(address).to.contain(":");
            expect(address).to.equal("13:14:34:24:11:ff");
        });
    });

    describe('Parse Function', function() {

        var packbuf;
        var parsePack;
        var testPacket;

        before('Parse before', function() {
            testPacket = {
                op: { value: 1, name: 'BOOTPREQUEST' },
                hlen: 6,
                hops: 0,
                xid: 681302462,
                secs: 4,
                flags: 0,
                ciaddr: '10.1.1.11',
                yiaddr: '10.1.1.12',
                siaddr: '10.1.1.13',
                giaddr: '10.1.1.14',
                chaddr: {
                    type: { value: 1, name: 'HW_ETHERNET' },    //Hardware Type
                    address: '08:00:27:9b:d9:be'
                },
                sname: 'sname',
                fname: 'fname',
                magic: 1669485411,
                options:
                {
                    subnetMask: '1.0.1.0',                  //option 1
                    timeOffset: 100,                        //option 2
                    routerOptions: ['10.11.12.14','10.11.12.15'],           //option 3
                    timeServerOption: ['10.11.12.13', '10.11.12.15'],              //option 4
                    domainNameServerOption: ['10.11.12.13', '10.11.12.15'],   //option 6
                    hostName: 'hostname',                   //option 12
                    domainName: 'domainName',               //option 15
                    broadcastAddress: '255.255.255.255',    //option 28
                    vendorOptions: {                        //option 43
                        '10': new Buffer('2344'),
                        '220': new Buffer('234')
                    },
                    requestedIpAddress: '192.111.1.100',    //option 50
                    ipAddressLeaseTime: 86400,              //option 51
                    optionOverload: 100,                    //option 52
                    dhcpMessageType: { value: 3, name: 'DHCPREQUEST' },   //option 53
                    serverIdentifier: '192.111.1.1',        //option 54
                    parameterRequestList:                   //option 55
                        [ 1, 2, 3, 4, 5, 6, 11, 12, 13, 15, 16, 17, 18, 22, 23, 28, 40,
                            41, 42, 43, 50, 51, 54, 58, 59, 60, 66, 67, 128, 129, 130,
                            131, 132, 133, 134, 135 ],
                    maximumMessageSize: 1260,               //option 57
                    renewalTimeValue: 200,                  //option 58
                    rebindingTimeValue: 300,                //option 59
                    vendorClassIdentifier: 'PXEClient:Arch:00000:UNDI:002001',   //option 60
                    clientIdentifier: {               //option 61
                        type: { value: 1, name: 'HW_ETHERNET' },
                        address: '00:23:4e:ff:ff:ff'
                    },
                    bootFileName: 'bootfilename',           //option 67
                    userClass: 'userclass',                 //option 77
                    fullyQualifiedDomainName: {             //option 81
                        flags: 0,
                        name: 'IDEAPAD.'
                    },
                    archType: 2,                            //option 93
                    subnetAddress: '10.1.1.15',             //option 118
                    unhandledOptions: 'fake option'         //default
                }
            };

            //use the packet.createPacketBuffer() to make this packet into a buff to then parse.
            packbuf = packetDHCP.createPacketBuffer(testPacket);
            parsePack = parser.parse(packbuf);
        });

        beforeEach("Parse beforeEach", function() {
            msg = new Buffer(240);
            offset = 0;
            msg.fill(0);
            msg[0] = 0x3;
        });

        it("should define a packet", function() {
            parser.parse(msg);
            expect(parser.packet).to.not.be.an('undefined');
        });

        it("should throw an error if the message buffer is not long enough", function() {
            msg = new Buffer(2);

            expect(function() {
                parser.parse(msg);
            }).to.throw(Error);
        });

        it("should have a packet property op", function() {
            expect(parsePack).to.have.property('op');
            expect(parsePack.op.value).to.be.equal(testPacket.op.value);
            expect(parsePack.op.name).to.be.equal(testPacket.op.name);
        });

        it("should have a packet property hlen", function() {
            expect(parsePack).to.have.property('hlen');
            expect(parsePack.hlen).to.be.equal(testPacket.hlen);
        });

        it("should have a packet property hops", function() {
            expect(parsePack).to.have.property('hops');
            expect(parsePack.hops).to.be.equal(testPacket.hops);
        });

        it("should have a packet property xid", function() {
            expect(parsePack).to.have.property('xid');
            expect(parsePack.xid).to.be.equal(testPacket.xid);
        });

        it("should have a packet property secs", function() {
            expect(parsePack).to.have.property('secs');
            expect(parsePack.secs).to.be.equal(testPacket.secs);
        });

        it("should have a packet property flags", function() {
            expect(parsePack).to.have.property('flags');
            expect(parsePack.flags).to.be.equal(testPacket.flags);
        });

        it("should have a packet property ciaddr", function() {
            expect(parsePack).to.have.property('ciaddr');
            expect(parsePack.ciaddr).to.be.equal(testPacket.ciaddr);
        });

        it("should have a packet property yiaddr", function() {
            expect(parsePack).to.have.property('yiaddr');
            expect(parsePack.yiaddr).to.be.equal(testPacket.yiaddr);
        });

        it("should have a packet property siaddr", function() {
            expect(parsePack).to.have.property('siaddr');
            expect(parsePack.siaddr).to.be.equal(testPacket.siaddr);
        });

        it("should have a packet property giaddr", function() {
            expect(parsePack).to.have.property('giaddr');
            expect(parsePack.giaddr).to.be.equal(testPacket.giaddr);
        });

        it("should have a packet property chaddr", function() {
            expect(parsePack).to.have.property('chaddr');
            expect(parsePack.chaddr).to.have.property('address');
            expect(parsePack.chaddr).to.have.property('type');
            expect(parsePack.chaddr.address).to.be.equal(testPacket.chaddr.address);
            expect(parsePack.chaddr.type.value).to.be.equal(testPacket.chaddr.type.value);
        });

        it("should have a packet property sname", function() {
            expect(parsePack).to.have.property('sname');
            expect(parsePack.sname).to.be.equal(testPacket.sname);
        });

        it("should have a packet property fname", function() {
            expect(parsePack).to.have.property('fname');
            expect(parsePack.fname).to.be.equal(testPacket.fname);
        });

        it("should have a packet property magic", function() {
            expect(parsePack).to.have.property('magic');
            expect(parsePack.magic).to.be.equal(testPacket.magic);
        });

        it("should have a pack property options", function() {
            expect(parsePack).to.have.property('options');
        });

        it("should have a packet option subnetMask", function() {       //case 1
            expect(parsePack.options).to.have.property('subnetMask');
            expect(parsePack.options.subnetMask).to.be.equal(testPacket.options.subnetMask);
        });

        it("should have a packet option timeOffset", function() {       //case 2
            expect(parsePack.options).to.have.property('timeOffset');
            expect(parsePack.options.timeOffset).to.be.equal(testPacket.options.timeOffset);
        });

        it("should have a packet option routerOptions", function() {       //case 3
            expect(parsePack.options).to.have.property('routerOptions');
            expect(parsePack.options.routerOptions).to.be.eql(testPacket.options.routerOptions);
        });

        it("should have a packet option timeServerOption", function() {       //case 4
            expect(parsePack.options).to.have.property('timeServerOption');
            expect(parsePack.options.timeServerOption)
                .to.be.eql(testPacket.options.timeServerOption);
        });

        it("should have a packet option domainNameServerOption", function() {   //case 6
            expect(parsePack.options).to.have.property('domainNameServerOption');
            expect(parsePack.options.domainNameServerOption)
                .to.be.eql(testPacket.options.domainNameServerOption);
        });

        it("should have a packet option hostName", function() {       //case 12
            expect(parsePack.options).to.have.property('hostName');
            expect(parsePack.options.hostName).to.be.equal(testPacket.options.hostName);
        });

        it("should have a packet option domainName", function() {       //case 15
            expect(parsePack.options).to.have.property('domainName');
            expect(parsePack.options.domainName).to.be.equal(testPacket.options.domainName);
        });

        it("should have a packet option broadcastAddress", function() {       //case 28
            expect(parsePack.options).to.have.property('broadcastAddress');
            expect(parsePack.options.broadcastAddress)
                .to.be.equal(testPacket.options.broadcastAddress);
        });

        it("should have a packet option vendorOptions", function() {       //case 43
            expect(parsePack.options).to.have.property('vendorOptions');
            expect(parsePack.options.vendorOptions).to.be.eql(testPacket.options.vendorOptions);
        });

        it("should have a packet option requestedIpAddress", function() {       //case 50
            expect(parsePack.options).to.have.property('requestedIpAddress');
            expect(parsePack.options.requestedIpAddress)
                .to.be.equal(testPacket.options.requestedIpAddress);
        });

        it("should have a packet option ipAddressLeaseTimes", function() {       //case 51
            expect(parsePack.options).to.have.property('ipAddressLeaseTime');
            expect(parsePack.options.ipAddressLeaseTime)
                .to.be.equal(testPacket.options.ipAddressLeaseTime);
        });

        it("should have a packet option optionOverload", function() {       //case 52
            expect(parsePack.options).to.have.property('optionOverload');
            expect(parsePack.options.optionOverload).to.be.equal(testPacket.options.optionOverload);
        });

        it("should have a packet option dhcpMessageType", function() {       //case 53
            expect(parsePack.options).to.have.property('dhcpMessageType');
            expect(parsePack.options.dhcpMessageType.value)
                .to.be.equal(testPacket.options.dhcpMessageType.value);
        });

        it("should have a packet option serverIdentifier", function() {       //case 54
            expect(parsePack.options).to.have.property('serverIdentifier');
            expect(parsePack.options.serverIdentifier)
                .to.be.equal(testPacket.options.serverIdentifier);
        });

        it("should have a packet option parameterRequestList", function() {       //case 55
            expect(parsePack.options).to.have.property('parameterRequestList');
            expect(parsePack.options.parameterRequestList)
                .to.include.members(testPacket.options.parameterRequestList);
        });

        it("should have a packet option maximumMessageSize", function() {       //case 57
            expect(parsePack.options).to.have.property('maximumMessageSize');
            expect(parsePack.options.maximumMessageSize)
                .to.be.equal(testPacket.options.maximumMessageSize);
        });

        it("should have a packet option renewalTimeValue", function() {       //case 58
            expect(parsePack.options).to.have.property('renewalTimeValue');
            expect(parsePack.options.renewalTimeValue)
                .to.be.equal(testPacket.options.renewalTimeValue);
        });

        it("should have a packet option rebindingTimeValue", function() {       //case 59
            expect(parsePack.options).to.have.property('rebindingTimeValue');
            expect(parsePack.options.rebindingTimeValue)
                .to.be.equal(testPacket.options.rebindingTimeValue);
        });

        it("should have a packet option vendorClassIdentifier", function() {       //case 60
            expect(parsePack.options).to.have.property('vendorClassIdentifier');
            expect(parsePack.options.vendorClassIdentifier)
                .to.be.equal(testPacket.options.vendorClassIdentifier);
        });

        it("should have a packet option clientIdentifier", function() {       //case 61
            expect(parsePack.options).to.have.property('clientIdentifier');
            expect(parsePack.options.clientIdentifier.type.value)
                .to.be.equal(testPacket.options.clientIdentifier.type.value);
            expect(parsePack.options.clientIdentifier.address)
                .to.be.equal(testPacket.options.clientIdentifier.address);
        });

        it("should have a packet option bootFileName", function() {       //case 67
            expect(parsePack.options).to.have.property('bootFileName');
            expect(parsePack.options.bootFileName).to.be.equal(testPacket.options.bootFileName);
        });

        it("should have a packet option userClass", function() {       //case 77
            expect(parsePack.options).to.have.property('userClass');
            expect(parsePack.options.userClass).to.be.equal(testPacket.options.userClass);
        });

        it("should have a packet option fullyQualifiedDomainName", function() {      //case 81
            expect(parsePack.options).to.have.property('fullyQualifiedDomainName');
            expect(parsePack.options.fullyQualifiedDomainName.name)
                .to.be.equal(testPacket.options.fullyQualifiedDomainName.name);
            expect(parsePack.options.fullyQualifiedDomainName.flags)
                .to.be.equal(testPacket.options.fullyQualifiedDomainName.flags);
        });

        it("should have a packet option archType", function() {       //case 93
            expect(parsePack.options).to.have.property('archType');
            expect(parsePack.options.archType).to.be.equal(testPacket.options.archType);
        });

        it("should have a packet option subnetAddress", function() {       //case 118
            expect(parsePack.options).to.have.property('subnetAddress');
            expect(parsePack.options.subnetAddress).to.be.equal(testPacket.options.subnetAddress);
        });

        it("should have a packet option for default"); //option default

    });

});
