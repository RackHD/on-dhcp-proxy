// Copyright 2015, EMC, Inc.
/* jshint node: true */

"use strict";

describe("MessageHandler", function() {
    var lookupService;
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
        lookupService = helper.injector.get('Services.Lookup');
        sinon.stub(lookupService, 'setIpAddress').resolves();
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

    after("MessageHandler after", function() {
        lookupService.setIpAddress.restore();
    });

    describe("ActionHandler", function() {
        var actionHandler;
        var thrown;
        var nextFn = function () {};

        beforeEach("ActionHandler beforeEach", function() {
            actionHandler = messageHandler.createActionHandler(packetData);
            sinon.stub(actionHandler, 'getDefaultBootfile');
            thrown = false;
        });

        it("should resolve default bootfile on discover action", function() {
            var testDefaultBootfile = 'test-default-bootfile';
            actionHandler.getDefaultBootfile.returns(testDefaultBootfile);

            return Promise.resolve()
            .then(function() {
                return actionHandler.handleAction(nextFn, 'discover', undefined);
            })
            .catch(function(error) {
                thrown = true;
                expect(error).to.be.an.instanceof(Errors.BreakPromiseChainError);
            })
            .then(function() {
                expect(thrown).to.equal(true);
                return actionHandler.deferred;
            })
            .then(function(out) {
                expect(out).to.equal(testDefaultBootfile);
                expect(actionHandler.getDefaultBootfile)
                    .to.have.been.calledWith(actionHandler.packetData);
            });
        });

        it("should do nothing on ignore action", function() {
            return Promise.resolve()
            .then(function() {
                return actionHandler.handleAction(nextFn, 'ignore', undefined);
            })
            .catch(function(error) {
                thrown = true;
                expect(error).to.be.an.instanceof(Errors.BreakPromiseChainError);
            })
            .then(function() {
                expect(thrown).to.equal(true);
                return actionHandler.deferred;
            })
            .then(function(out) {
                expect(out).to.equal(null);
            });
        });

        it("should call next on next action", function() {
            var nextOut = { action: 'test' };
            var nextStub = sinon.stub().resolves(nextOut);
            var data = 'testdata';

            return Promise.resolve()
            .then(function() {
                return actionHandler.handleAction(nextStub, 'next', data);
            })
            .then(function(out) {
                expect(out).to.equal(nextOut);
                expect(nextStub).to.have.been.calledWith(data);
            });
        });

        it("should resolve default bootfile on send-default-bootfile action", function() {
            var testDefaultBootfile = 'test-default-bootfile';
            actionHandler.getDefaultBootfile.returns(testDefaultBootfile);

            return Promise.resolve()
            .then(function() {
                return actionHandler.handleAction(nextFn, 'send-default-bootfile', undefined);
            })
            .catch(function(error) {
                thrown = true;
                expect(error).to.be.an.instanceof(Errors.BreakPromiseChainError);
            })
            .then(function() {
                expect(thrown).to.equal(true);
                return actionHandler.deferred;
            })
            .then(function(out) {
                expect(out).to.equal(testDefaultBootfile);
                expect(actionHandler.getDefaultBootfile)
                    .to.have.been.calledWith(actionHandler.packetData);
            });
        });

        it("should resolve task-specified bootfile on send-custom-bootfile action", function() {
            var testCustomBootfile = 'test-custom-bootfile';

            return Promise.resolve()
            .then(function() {
                return actionHandler.handleAction(
                    nextFn, 'send-custom-bootfile', testCustomBootfile);
            })
            .catch(function(error) {
                thrown = true;
                expect(error).to.be.an.instanceof(Errors.BreakPromiseChainError);
            })
            .then(function() {
                expect(thrown).to.equal(true);
                return actionHandler.deferred;
            })
            .then(function(out) {
                expect(out).to.equal(testCustomBootfile);
            });
        });

        it("should throw on an unrecognized action", function() {
        });
    });

    describe("getNodeAction", function() {
        var Errors;
        var node;

        before("MessageHandler:getNodeAction before", function() {
            Errors = helper.injector.get('Errors');
            sinon.stub(lookupService, 'macAddressToNode');
            node = {
                discovered: sinon.stub(),
                id: 'testnodeid'
            };
        });

        beforeEach("MessageHandler:getNodeAction beforeEach", function() {
            lookupService.macAddressToNode.reset();
            node.discovered.rejects(new Error('override in test'));
            node.discovered.reset();
        });

        after("MessageHandler:getNodeAction after", function() {
            lookupService.macAddressToNode.restore();
        });

        it("should call lookupService.macAddressToNode with node mac address", function() {
            node.discovered.resolves(false);
            lookupService.macAddressToNode.resolves(node);
            return messageHandler.getNodeAction(packetData.chaddr.address)
            .then(function() {
                expect(lookupService.macAddressToNode)
                    .to.have.been.calledWith(packetData.chaddr.address);
            });
        });

        it("should get the node action for a new node", function() {
            lookupService.macAddressToNode.rejects(new Errors.NotFoundError(''));

            return messageHandler.getNodeAction(packetData.chaddr.address)
            .then(function(out) {
                expect(out).to.have.property('action').that.equals('discover');
            });
        });

        it("should ignore a node on an unknown lookup failure", function() {
            lookupService.macAddressToNode.rejects(new Error(''));

            return messageHandler.getNodeAction(packetData.chaddr.address)
            .then(function(out) {
                expect(out).to.have.property('action').that.equals('ignore');
            });
        });

        it("should get the action for a node if it is has already been discovered", function() {
            node.discovered.resolves(true);
            lookupService.macAddressToNode.resolves(node);

            return messageHandler.getNodeAction(packetData.chaddr.address)
            .then(function(out) {
                expect(out).to.have.property('action').that.equals('next');
                expect(out).to.have.property('data').that.equals(testnodeid);
            });
        });

        it("should get the action for a known node if it has not been discovered", function() {
            node.discovered.resolves(false);
            lookupService.macAddressToNode.resolves(node);

            return messageHandler.getNodeAction(packetData.chaddr.address)
            .then(function(out) {
                expect(out).to.have.property('action').that.equals('discover');
            });
        });
    });

    describe("getKnownNodeAction", function() {
        var taskProtocol;
        var waterline;

        before("MessageHandler.getKnownNodeAction before", function() {
            taskProtocol = helper.injector.get('Protocol.Task');
            waterline = helper.injector.get('Services.Waterline');
            waterline.nodes = {
                findByIdentifier: function() {}
            };
            sinon.stub(taskProtocol, 'activeTaskExists');
            sinon.stub(waterline.nodes, 'findByIdentifier');
        });

        beforeEach("MessageHandler.getKnownNodeAction beforeEach", function() {
            taskProtocol.activeTaskExists.reset();
            waterline.nodes.findByIdentifier.reset();
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

        it("should get the action for a known node if it does not have an active task" +
                " and does not have bootSettings", function() {

            var node = { id: "testnodeid" };

            taskProtocol.activeTaskExists.rejects(new Error(''));
            waterline.nodes.findByIdentifier.resolves(node);

            return messageHandler.getKnownNodeAction('testnodeid')
            .then(function(out) {
                expect(out).to.have.property('action').that.equals('ignore');
            });
        });

        it("should get the action for a known node if it does not have an active task" +
                " and have bootSettings", function() {

            var node = { id: "testnodeid", bootSettings: {} };

            taskProtocol.activeTaskExists.rejects(new Error(''));
            waterline.nodes.findByIdentifier.resolves(node);

            return messageHandler.getKnownNodeAction('testnodeid')
            .then(function(out) {
                expect(out).to.have.property('action').that.equals('next');
                expect(out).to.have.property('data').that.equals(testnodeid);
            });
        });

        it("should get the action for a known node if it does not have an active task" +
                " and has exceptions when findByIdentifier", function() {

            taskProtocol.activeTaskExists.rejects(new Error(''));
            waterline.nodes.findByIdentifier.rejects(new Error(''));

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
            packetData.options.userClass = 'MonoRail';

            configuration.get.withArgs('apiServerAddress').returns('10.1.1.1');
            configuration.get.withArgs('apiServerPort').returns('80');
            expect(messageHandler.getDefaultBootfile(packetData)).to.equal(expectedUrl);
        });

        it("should return the profiles API with mac params for arista nodes", function() {
            var expectedUrl =
                'http://10.1.1.1:80/api/common/profiles?macs=' + packetData.chaddr.address;
            packetData.options.vendorClassIdentifier = 'Arista';

            configuration.get.withArgs('apiServerAddress').returns('10.1.1.1');
            configuration.get.withArgs('apiServerPort').returns('80');
            expect(messageHandler.getDefaultBootfile(packetData)).to.equal(expectedUrl);
        });

        it("should return the profiles API for mellanox mac addresses", function() {
            var expectedUrl = 'http://10.1.1.1:80/api/common/profiles';
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
            packetData.options.vendorClassIdentifier = 'PXEClient:Arch:00000:UNDI:002001';
            expect(messageHandler.getDefaultBootfile(packetData)).to.equal('monorail-undionly.kpxe');
        });

        it("should return the default customized monorail ipxe if no special cases are met", function() {
            packetData.options.vendorClassIdentifier = 'testVendorClass';
            expect(messageHandler.getDefaultBootfile(packetData)).to.equal('monorail.ipxe');
        });
    });

    describe("getBootfile", function() {
        before("MessageHandler.getBootfile before", function() {
            sinon.stub(messageHandler, 'getDefaultBootfile');
            sinon.stub(messageHandler, 'getNodeAction');
            sinon.stub(messageHandler, 'getKnownNodeAction');
            sinon.stub(messageHandler, 'getKnownNodeActionFromTask');
        });

        beforeEach("MessageHandler.getBootfile beforeEach", function() {
            messageHandler.getDefaultBootfile.reset();
            messageHandler.getNodeAction.reset();
            messageHandler.getKnownNodeAction.reset();
            messageHandler.getKnownNodeActionFromTask.reset();
        });

        after("MessageHandler.getBootfile after", function() {
            messageHandler.getDefaultBootfile.restore();
            messageHandler.getNodeAction.restore();
            messageHandler.getKnownNodeAction.restore();
            messageHandler.getKnownNodeActionFromTask.restore();
        });

        it("should return a bootfile for an unknown node", function() {
            var bootfile = 'test.ipxe';
            messageHandler.getNodeAction.resolves({ action: 'discover' });
            messageHandler.getDefaultBootfile.returns(bootfile);

            return messageHandler.getBootfile(packetData)
            .then(function(_bootfile) {
                expect(messageHandler.getNodeAction).to.have.been.calledOnce;
                expect(messageHandler.getKnownNodeAction).to.not.have.been.called;
                expect(messageHandler.getKnownNodeActionFromTask).to.not.have.been.called;
                expect(_bootfile).to.equal(bootfile);
            });
        });

        it("should not return a bootfile for a known node with no active task", function() {
            var testnodeid = 'testnodeid';
            messageHandler.getNodeAction.resolves({ action: 'next', data: testnodeid });
            messageHandler.getKnownNodeAction.resolves({ action: 'ignore' });

            return messageHandler.getBootfile(packetData)
            .then(function(_bootfile) {
                expect(messageHandler.getNodeAction).to.have.been.calledOnce;
                expect(messageHandler.getKnownNodeAction).to.have.been.calledWith(testnodeid);
                expect(messageHandler.getKnownNodeActionFromTask).to.not.have.been.called;
                expect(_bootfile).to.equal(null);
            });
        });

        it("should return a default bootfile for known node with an active task", function() {
            var bootfile = 'test.ipxe';
            var testnodeid = 'testnodeid';
            messageHandler.getNodeAction.resolves({ action: 'next', data: testnodeid });
            messageHandler.getKnownNodeAction.resolves({ action: 'next', data: testnodeid });
            messageHandler.getKnownNodeActionFromTask.resolves({ action: 'send-default-bootfile' });
            messageHandler.getDefaultBootfile.returns(bootfile);

            return messageHandler.getBootfile(packetData)
            .then(function(_bootfile) {
                expect(messageHandler.getNodeAction).to.have.been.calledOnce;
                expect(messageHandler.getKnownNodeAction).to.have.been.calledOnce;
                expect(messageHandler.getKnownNodeActionFromTask).to.have.been.calledOnce;
                expect(_bootfile).to.equal(bootfile);
            });
        });

        it("should return a custom bootfile for known node with an active task", function() {
            var bootfile = 'testcustom.ipxe';
            messageHandler.getNodeAction.resolves({ action: 'next', data: testnodeid });
            messageHandler.getKnownNodeAction.resolves({ action: 'next', data: testnodeid });
            messageHandler.getKnownNodeActionFromTask.resolves(
                { action: 'send-custom-bootfile', data: bootfile }
            );

            return messageHandler.getBootfile(packetData)
            .then(function(_bootfile) {
                expect(messageHandler.getNodeAction).to.have.been.calledOnce;
                expect(messageHandler.getKnownNodeAction).to.have.been.calledOnce;
                expect(messageHandler.getKnownNodeActionFromTask).to.have.been.calledOnce;
                expect(_bootfile).to.equal(bootfile);
            });
        });

        it("should reject on internal failures getting node data", function() {
            messageHandler.getNodeAction.rejects(new Error('Test Error'));
            return expect(messageHandler.getBootfile(packetData)).to.be.rejectedWith(/Test Error/);
        });
    });

    describe("handleDhcpPacket", function() {
        var parser;
        var packetUtil;

        before("MessageHandler.handleDhcpPacket before", function() {
            packetUtil = helper.injector.get('DHCP.packet');
            parser = helper.injector.get('DHCP.parser');

            sinon.stub(messageHandler, 'getBootfile');
            sinon.stub(packetUtil, 'createProxyDhcpAck');
            sinon.stub(parser, 'parse');

            parser.parse.returns(packetData);
        });

        beforeEach("MessageHandler.handleDhcpPacket beforeEach", function() {
            messageHandler.getBootfile.reset();
            packetUtil.createProxyDhcpAck.reset();
        });

        after("MessageHandler.handleDhcpPacket after", function() {
            messageHandler.getBootfile.restore();
            packetUtil.createProxyDhcpAck.restore();
            parser.parse.restore();
        });

        it("should not call the send callback if not bootfile is specified", function() {
            var stubCallback = sinon.stub();
            messageHandler.getBootfile.resolves(null);

            return messageHandler.handleDhcpPacket(null, stubCallback)
            .then(function() {
                expect(stubCallback).to.not.have.been.called;
            });
        });

        it("should not call the send callback if lookupService.setIpAddress " +
            "resolves null", function() {
            var stubCallback = sinon.stub();
            lookupService.setIpAddress.resolves(null);

            return messageHandler.handleDhcpPacket(null, stubCallback)
                .then(function() {
                    expect(stubCallback).to.not.have.been.called;
                });
        });

        it("should call the send callback with a response packet", function() {
            var stubCallback = sinon.stub();
            var bootfile = 'testbootfile';
            packetUtil.createProxyDhcpAck.returns({ fname: bootfile });
            messageHandler.getBootfile.resolves(bootfile);

            return messageHandler.handleDhcpPacket(null, stubCallback)
            .then(function() {
                expect(packetUtil.createProxyDhcpAck).to.have.been.calledWith(packetData, bootfile);
                expect(stubCallback).to.have.been.calledWith({ fname: bootfile });
            });
        });

        it("should call lookupService and set the Ip address with" +
            " the response packet information", function() {
            var bootfile = 'testbootfile';
            var stubCallback = sinon.stub();
            packetUtil.createProxyDhcpAck.returns({ fname: bootfile });
            messageHandler.getBootfile.resolves(bootfile);

            return messageHandler.handleDhcpPacket(null, stubCallback)
                .then(function() {
                    expect(lookupService.setIpAddress).to.have.been.calledWith(packetData.ciaddr,
                        packetData.chaddr.address);
                    expect(stubCallback).to.have.been.calledWith({ fname: bootfile });
                });
        });
    });
});
