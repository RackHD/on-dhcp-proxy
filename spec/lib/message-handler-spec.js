// Copyright 2015, EMC, Inc.
/* jshint node: true */

"use strict";

describe("MessageHandler", function() {
    var Errors;
    var messageHandler;
    var packetData;
    var testnodeid = 'testnodeid';
    var Promise;

    before('DHCP MessageHandler before', function() {
        helper.setupInjector(
            [
                helper.require('/lib/message-handler'),
                helper.require('/lib/packet'),
                helper.require('/lib/parser'),
                helper.require('/lib/dhcp-protocol')
            ]
        );
        Errors = helper.injector.get('Errors');
        var Logger = helper.injector.get('Logger');
        Promise = helper.injector.get('Promise');
        Logger.prototype.log = sinon.stub();
        messageHandler = helper.injector.get('DHCP.messageHandler');
    });

    beforeEach("MessageHandler beforeEach", function() {
        packetData = {
            chaddr: {
                address: '00:00:00:00:00:00'
            },
            ciaddr: '10.1.1.11',
            options: {}
        };
    });

    describe("getDefaultBootfile", function() {
        var configuration;

        before("MessageHandler.getDefaultBootfile before", function() {
            configuration = helper.injector.get('Services.Configuration');
            sinon.stub(configuration, 'get');
        });

        beforeEach("MessageHandler.getDefaultBootfile beforeEach", function() {
            configuration.get.reset();
        });

        after("MessageHandler.getDefaultBootfile after", function() {
            configuration.get.restore();
        });

        it("should return the profiles API for an iPXE user class", function() {
            var expectedUrl = 'http://10.1.1.1:80/api/current/profiles';
            packetData.options.userClass = 'MonoRail';

            configuration.get.withArgs('apiServerAddress').returns('10.1.1.1');
            configuration.get.withArgs('apiServerPort').returns('80');
            expect(messageHandler.getDefaultBootfile(packetData)).to.equal(expectedUrl);
        });

        it("should return the profiles API with mac params for arista nodes", function() {
            var expectedUrl =
                'http://10.1.1.1:80/api/current/profiles?macs=' + packetData.chaddr.address;
            packetData.options.vendorClassIdentifier = 'Arista';

            configuration.get.withArgs('apiServerAddress').returns('10.1.1.1');
            configuration.get.withArgs('apiServerPort').returns('80');
            expect(messageHandler.getDefaultBootfile(packetData)).to.equal(expectedUrl);
        });

        it("should return the profiles API for mellanox mac addresses", function() {
            var expectedUrl = 'http://10.1.1.1:80/api/current/profiles';
            packetData.chaddr.address = '00:02:c9:00:00:00';

            configuration.get.withArgs('apiServerAddress').returns('10.1.1.1');
            configuration.get.withArgs('apiServerPort').returns('80');
            expect(messageHandler.getDefaultBootfile(packetData)).to.equal(expectedUrl);
        });

        it("should return intel.ipxe for intel mac addresses", function() {
            packetData.chaddr.address = 'ec:a8:6b:00:00:00';
            expect(messageHandler.getDefaultBootfile(packetData)).to.equal('monorail.intel.ipxe');
        });

        it("should return customized monorail undionly.kpxe for UNDI pxe dhcp request", function() {
            packetData.options.archType = 0;
            packetData.options.vendorClassIdentifier = 'PXEClient:Arch:00000:UNDI:002001';
            expect(messageHandler.getDefaultBootfile(packetData))
                .to.equal('monorail-undionly.kpxe');
        });

        it("should return the default customized monorail ipxe if no special" +
                "cases are met", function() {
            packetData.options.vendorClassIdentifier = 'testVendorClass';
            expect(messageHandler.getDefaultBootfile(packetData)).to.equal('monorail.ipxe');
        });
    });

    describe("handleDhcpPacket", function() {
        var parser;
        var packetUtil;

        before("MessageHandler.handleDhcpPacket before", function() {
            packetUtil = helper.injector.get('DHCP.packet');
            parser = helper.injector.get('DHCP.parser');

            sinon.stub(messageHandler, 'getDefaultBootfile');
            sinon.stub(packetUtil, 'createProxyDhcpAck');
            sinon.stub(parser, 'parse');
        });

        beforeEach("MessageHandler.handleDhcpPacket beforeEach", function() {
            messageHandler.getDefaultBootfile.reset();
            packetUtil.createProxyDhcpAck.reset();

            parser.parse.returns(packetData);
        });

        after("MessageHandler.handleDhcpPacket after", function() {
            messageHandler.getDefaultBootfile.restore();
            packetUtil.createProxyDhcpAck.restore();
            parser.parse.restore();
        });

        it("should not call the send callback if not bootfile is specified", function() {
            var stubCallback = sinon.stub();
            messageHandler.getDefaultBootfile.resolves(null);

            return messageHandler.handleDhcpPacket(null, stubCallback)
            .then(function() {
                expect(stubCallback).to.not.have.been.called;
            });
        });

        it("should call the send callback with a response packet", function() {
            var stubCallback = sinon.stub();
            var bootfile = 'testbootfile';
            packetUtil.createProxyDhcpAck.returns({ fname: bootfile });
            messageHandler.getDefaultBootfile.resolves(bootfile);

            return messageHandler.handleDhcpPacket(null, stubCallback)
            .then(function() {
                expect(packetUtil.createProxyDhcpAck).to.have.been.calledWith(packetData, bootfile);
                expect(stubCallback).to.have.been.calledWith({ fname: bootfile });
            });
        });

    });
});
