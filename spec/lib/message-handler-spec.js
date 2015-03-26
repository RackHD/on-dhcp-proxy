// Copyright 2014-2015, Renasar Technologies Inc.
/* jshint node: true */

"use strict";

before('DHCP server before', function() {
    helper.setupInjector(
        [
            helper.require('/lib/message-handler'),
            helper.require('/lib/packet'),
            helper.require('/lib/parser'),
            helper.require('/lib/dhcp-protocol'),
            helper.di.simpleWrapper({ dhcpCache: {} }, 'Services.LookupCache')
        ]
    );
    var Logger = helper.injector.get('Logger');
    Logger.prototype.log = sinon.stub();
});

describe("MessageHandler", function() {
    var messageHandler;
    var packetData;
    var testnodeid = 'testnodeid';

    before("MessageHandler before", function() {
        messageHandler = helper.injector.get('DHCP.messageHandler');
    });

    beforeEach("MessageHandler beforeEach", function() {
        packetData = {
            chaddr: '00:00:00:00:00:00'
        };
    });

    describe("getNodeAction", function() {
        var lookupService;
        var Errors;

        before("MessageHandler:getNodeAction before", function() {
            lookupService = helper.injector.get('Services.Lookup');
            Errors = helper.injector.get('Errors');
            sinon.stub(lookupService, 'macAddressToNodeId');
        });

        beforeEach("MessageHandler:getNodeAction beforeEach", function() {
            lookupService.macAddressToNodeId.reset();
        });

        after("MessageHandler:getNodeAction after", function() {
            lookupService.macAddressToNodeId.restore();
        });

        it("should call lookupService.macAddressToNodeId with node mac address", function() {
            lookupService.macAddressToNodeId.resolves('');
            return messageHandler.getNodeAction(packetData.chaddr)
            .then(function() {
                expect(lookupService.macAddressToNodeId).to.have.been.calledWith(packetData.chaddr);
            });
        });

        it("should get the node action for a new node", function() {
            lookupService.macAddressToNodeId.rejects(new Errors.LookupError(''));

            return messageHandler.getNodeAction(packetData.chaddr)
            .then(function(out) {
                expect(out).to.have.property('action').that.equals('discover');
            });
        });

        it("should ignore a node on an unknown lookup failure", function() {
            lookupService.macAddressToNodeId.rejects(new Error(''));

            return messageHandler.getNodeAction(packetData.chaddr)
            .then(function(out) {
                expect(out).to.have.property('action').that.equals('ignore');
            });
        });

        it("should get the action for a node if it is determined to be already known", function() {
            lookupService.macAddressToNodeId.resolves(testnodeid);

            return messageHandler.getNodeAction(packetData.chaddr)
            .then(function(out) {
                expect(out).to.have.property('action').that.equals('next');
                expect(out).to.have.property('data').that.equals(testnodeid);
            });
        });
    });

    describe("getKnownNodeAction", function() {
        var taskProtocol;

        before("MessageHandler.getKnownNodeAction before", function() {
            taskProtocol = helper.injector.get('Protocol.Task');
            sinon.stub(taskProtocol, 'activeTaskExists');
        });

        beforeEach("MessageHandler.getKnownNodeAction beforeEach", function() {
            taskProtocol.activeTaskExists.reset();
        });

        after("MessageHandler.getKnownNodeAction after", function() {
            taskProtocol.activeTaskExists.restore();
        });

        it("should call taskProtocol.activeTaskExists with node id", function() {
            var testnodeid = 'testnodeid';
            taskProtocol.activeTaskExists.resolves();

            return messageHandler.getKnownNodeAction(testnodeid)
            .then(function() {
                expect(taskProtocol.activeTaskExists).to.have.been.calledWith(testnodeid);
            });
        });

        it("should get the action for a known node if it does not have an active task", function() {
            taskProtocol.activeTaskExists.rejects(new Error(''));

            return messageHandler.getKnownNodeAction('testnodeid')
            .then(function(out) {
                expect(out).to.have.property('action').that.equals('ignore');
            });
        });

        it("should get the action for a known node if it has an active task", function() {
            taskProtocol.activeTaskExists.resolves(testnodeid);

            return messageHandler.getKnownNodeAction(testnodeid)
            .then(function(out) {
                expect(out).to.have.property('action').that.equals('next');
                expect(out).to.have.property('data').that.equals(testnodeid);
            });
        });
    });

    describe("getKnownNodeActionFromTask", function() {
        var taskProtocol;

        before("MessageHandler.getKnownNodeActionFromTask before", function() {
            taskProtocol = helper.injector.get('Protocol.Task');
            sinon.stub(taskProtocol, 'getBootProfile');
        });

        beforeEach("MessageHandler.getKnownNodeActionFromTask beforeEach", function() {
            taskProtocol.getBootProfile.reset();
        });

        after("MessageHandler.getKnownNodeActionFromTask after", function() {
            taskProtocol.getBootProfile.restore();
        });

        it("should call taskProtocol.getBootProfile with node id", function() {
            var testnodeid = 'testnodeid';
            taskProtocol.getBootProfile.resolves();

            return messageHandler.getKnownNodeActionFromTask(testnodeid)
            .then(function() {
                expect(taskProtocol.getBootProfile).to.have.been.calledWith(testnodeid);
            });
        });

        it("should specify the default bootfile action if the task does not set one", function() {
            taskProtocol.getBootProfile.rejects(new Error(''));

            return messageHandler.getKnownNodeActionFromTask(testnodeid)
            .then(function(out) {
                expect(out).to.have.property('action').that.equals('send-default-bootfile');
            });
        });

        it("should specify the custom bootfile action if the task sets one", function() {
            var testBootfile = 'testBootfile';
            taskProtocol.getBootProfile.resolves(testBootfile);

            return messageHandler.getKnownNodeActionFromTask(testnodeid)
            .then(function(out) {
                expect(out).to.have.property('action').that.equals('send-custom-bootfile');
                expect(out).to.have.property('data').that.equals(testBootfile);
            });
        });
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
            var expectedUrl = 'http://10.1.1.1:80/api/common/profiles';
            packetData.userClass = 'iPXE';

            configuration.get.withArgs('server').returns('10.1.1.1');
            configuration.get.withArgs('httpPort').returns('80');
            expect(messageHandler.getDefaultBootfile(packetData)).to.equal(expectedUrl);
        });

        it("should return the profiles API with mac params for arista nodes", function() {
            var expectedUrl = 'http://10.1.1.1:80/api/common/profiles?macs=' + packetData.chaddr;
            packetData.vendorClassIdentifier = 'Arista';

            configuration.get.withArgs('server').returns('10.1.1.1');
            configuration.get.withArgs('httpPort').returns('80');
            expect(messageHandler.getDefaultBootfile(packetData)).to.equal(expectedUrl);
        });

        it("should return the profiles API for mellanox mac addresses", function() {
            var expectedUrl = 'http://10.1.1.1:80/api/common/profiles';
            packetData.chaddr = '00:02:c9:00:00:00';

            configuration.get.withArgs('server').returns('10.1.1.1');
            configuration.get.withArgs('httpPort').returns('80');
            expect(messageHandler.getDefaultBootfile(packetData)).to.equal(expectedUrl);
        });

        it("should return intel.ipxe for intel mac addresses", function() {
            packetData.chaddr = 'ec:a8:6b:00:00:00';
            expect(messageHandler.getDefaultBootfile(packetData)).to.equal('intel.ipxe');
        });

        it("should return the default ipxe script if no special cases are met", function() {
            packetData.vendorClassIdentifier = 'testVendorClass';
            expect(messageHandler.getDefaultBootfile(packetData)).to.equal('renasar.ipxe');
        });
    });
});
