// Copyright 2015, Renasar Technologies Inc.
/* jshint node: true */

"use strict";

var testPacket = {
    op: { value: 1, name: 'BOOTPREQUEST' },
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
        dhcpMessageType: { value: 3, name: 'DHCPREQUEST' },
        parameterRequestList:
       [ 1, 2, 3, 4, 5, 6, 11, 12, 13, 15, 16, 17, 18, 22, 23, 28, 40, 41, 42, 43,
         50, 51, 54, 58, 59, 60, 66, 67, 128, 129, 130, 131, 132, 133, 134, 135 ],
    maximumMessageSize: 1260,
    vendorClassIdentifier: 'PXEClient:Arch:00000:UNDI:002001' }
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
});

describe("Packet", function() {
    var packetUtil;
    var configuration;
    var protocol;

    describe("createProxyDhcpAck", function() {
        before("createProxyDhcpAck before", function() {
            protocol = helper.injector.get('DHCP.protocol');

            packetUtil = helper.injector.get('DHCP.packet');
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
            configuration.get.withArgs('server').returns('10.1.1.1');
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
});
