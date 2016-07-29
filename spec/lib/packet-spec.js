// Copyright 2015, EMC, Inc.
/* jshint node: true */

"use strict";

describe("Packet", function() {
    var packetUtil;
    var configuration;
    var protocol;
    var testPacket = {
        op: { value: 1, name: 'BOOTPREQUEST' },
        htype: { value: 1, name : 'HW_ETHERNET'},
        hlen: 6,
        hops: 0,
        xid: 681302462,
        secs: 4,
        flags: 0,
        ciaddr: '10.1.1.11',
        chaddr: {
            type: { value: 1, name: 'HW_ETHERNET' },
            address: '08:00:27:9b:d9:be'
        },
        sname: '',
        fname: '',
        magic: 1669485411,
        options:
        {
            dhcpMessageType: 0x2,
            parameterRequestList:
           [ 1, 2, 3, 4, 5, 6, 11, 12, 13, 15, 16, 17, 18, 22, 23, 28, 40, 41, 42, 43,
             50, 51, 54, 58, 59, 60, 66, 67, 128, 129, 130, 131, 132, 133, 134, 135 ],
            maximumMessageSize: 1260,
            vendorClassIdentifier: 'PXEClient:Arch:00000:UNDI:002001'
        }
    };

    before('DHCP packet before', function() {
        helper.setupInjector(
            [
                helper.require('/lib/packet'),
                helper.require('/lib/dhcp-protocol')
            ]
        );
        var Logger = helper.injector.get('Logger');
        Logger.prototype.log = sinon.stub();

        packetUtil = helper.injector.get('DHCP.packet');
        protocol = helper.injector.get('DHCP.protocol');
    });

    describe("createProxyDhcpAck", function() {
        before("createProxyDhcpAck before", function() {
            sinon.spy(packetUtil, 'createPacketBuffer');

            configuration = helper.injector.get('Services.Configuration');
            sinon.stub(configuration, 'get');
        });

        beforeEach("createProxyDhcpAck beforeEach", function() {
            packetUtil.createPacketBuffer.reset();
            configuration.get.reset();
        });

        after("createProxyDhcpAck after", function() {
            configuration.get.restore();
        });

        it("should return the intended data object for use by the server", function() {
            var data = packetUtil.createProxyDhcpAck(testPacket, null);
            expect(data).to.have.property('packetBuffer').that.is.an.instanceof(Buffer);
            expect(data).to.have.property('destination').that.equals(testPacket.ciaddr);
        });

        it("should create a proper ACK packet for proxyDHCP", function() {
            var testbootfile = 'testbootfile';
            configuration.get.withArgs('tftpBindAddress').returns('10.1.1.1');
            configuration.get.withArgs('broadcastaddr').returns('10.1.1.255');

            packetUtil.createProxyDhcpAck(testPacket, testbootfile);
            var builtPacket = packetUtil.createPacketBuffer.firstCall.args[0];
            var options = builtPacket.options;

            expect(options).to.be.an.object;
            expect(builtPacket).to.have.property('fname').that.equals(testbootfile);
            expect(builtPacket).to.have.property('sname').that.equals('10.1.1.1');
            expect(builtPacket).to.have.property('siaddr').that.equals('10.1.1.1');
            expect(options).to.have.property('dhcpMessageType')
                .that.equals(protocol.DHCPMessageType.DHCPACK.value);
        });
    });

    describe("createPacketBuffer", function() {
        it("should throw an error if the packet does not have xid", function() {
            var pkt = {};

            expect(function() {
                packetUtil.createPacketBuffer(pkt);
            }).to.throw(Error);
        });

        it("should throw an error if the packet does not have chaddr", function() {
            var pkt = {xid: 681302462};

            expect(function() {
                packetUtil.createPacketBuffer(pkt);
            }).to.throw(Error);
        });

        it("should throw an error if the packet sname is greater than 64", function() {
            var pkt  = {
                xid: 681302462,
                chaddr: {
                    type: { value: 1, name: 'HW_ETHERNET' },
                    address: '08:00:27:9b:d9:be'
                },
                sname: 65
            };

            expect(function() {
                packetUtil.createPacketBuffer(pkt);
            }).to.throw(Error);
        });

        it("should throw an error if the packet fname is greater than 128", function() {
            var pkt  = {
                xid: 681302462,
                chaddr: {
                    type: { value: 1, name: 'HW_ETHERNET' },
                    address: '08:00:27:9b:d9:be'
                },
                sname: '',
                fname: 129
            };

            expect(function() {
                packetUtil.createPacketBuffer(pkt);
            }).to.throw(Error);
        });

        it("should throw an error if the packet chaddr hw buffer does not equal 6 ':'", function() {
            var pkt  = {
                xid: 681302462,
                chaddr: "123"
            };

            expect(function() {
                packetUtil.createPacketBuffer(pkt);
            }).to.throw(Error);
        });

        it("should thow an error if the packet chaddr is an object type with " +
            "no 'address' key", function() {
            var pkt  = {
                xid: 681302462,
                chaddr: {
                    type: { value: 1, name: 'HW_ETHERNET' }
                }
            };

            expect(function() {
                packetUtil.createPacketBuffer(pkt);
            }).to.throw(Error);
        });

        it("should parse the options into the buffer", function() {
            var pkt = {
                op: { value: 1, name: 'BOOTPREQUEST' },
                xid: 681302462,
                chaddr: {
                    type: { value: 1, name: 'HW_ETHERNET' },
                    address: '08:00:27:9b:d9:be'
                },
                options:
                {
                    subnetMask: '0.0.0.0',                  //option 1
                    routerOptions: 'test string',           //option 3
                    broadcastAddress: '255.255.255.255',    //option 28
                    requestedIpAddress: '192.111.1.100',    //option 50
                    ipAddressLeaseTime: 86400,              //option 51
                    optionOverload: 100,                    //option 52
                    dhcpMessageType: { value: 3, name: 'DHCPREQUEST' },   //option 53
                    serverIdentifier: '192.111.1.1',        //option 54
                    parameterRequestList:                   //option 55
                        [ 1, 2, 3, 4, 5, 6, 11, 12, 13, 15, 16, 17, 18, 22, 23, 28, 40,
                            41, 42, 43, 50, 51, 54, 58, 59, 60, 66, 67, 128, 129, 130,
                            131, 132, 133, 134, 135 ],
                    renewalTimeValue: 200,                  //option 58
                    rebindingTimeValue: 300,                //option 59
                    vendorClassIdentifier: 'PXEClient:Arch:00000:UNDI:002001',   //option 60
                    clientIdentifier: {               //option 61
                        type: { value: 1, name: 'HW_ETHERNET' },
                        address: '00:23:4e:ff:ff:ff'
                    },
                    bootFileName: 'bootfilename',           //option 67
                    maximumMessageSize: 1260
                }
            };

            var buf = packetUtil.createPacketBuffer(pkt);

            expect(buf).to.be.a('object');
            expect(buf.length).to.be.above(300);
        });

        it("should parse no options", function() {
            var pkt = {
                xid: 681302462,
                chaddr: {
                    type: { value: 1, name: 'HW_ETHERNET' },
                    address: '08:00:27:9b:d9:be'
                }
            };

            var buf = packetUtil.createPacketBuffer(pkt);

            expect(buf).to.be.a('object');
            expect(buf.length).to.be.equal(300);
        });

        it("should throw an error when the option parameterRequestList length is great " +
            "than 0xff", function() {
            var pkt  = {
                xid: 681302462,
                chaddr: {
                    type: { value: 1, name: 'HW_ETHERNET' },
                    address: '08:00:27:9b:d9:be'
                },
                options:
                {
                    parameterRequestList: 0xFFFF
                }
            };

            expect(function() {
                packetUtil.createPacketBuffer(pkt);
            }).to.throw(Error);
        });

        it("should throw an error when the option clientIdentifierlength is great " +
            "than 0xff", function() {
            var pkt  = {
                xid: 681302462,
                chaddr: {
                    type: { value: 1, name: 'HW_ETHERNET' },
                    address: '08:00:27:9b:d9:be'
                },
                options:
                {
                    clientIdentifier: 0xFFFF
                }
            };

            expect(function() {
                packetUtil.createPacketBuffer(pkt);
            }).to.throw(Error);
        });

    });
});
