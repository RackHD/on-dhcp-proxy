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
            chaddr: {
                address: '00:00:00:00:00:00'
            },
            options: {}
        };
    });

    describe("ActionHandler", function() {
        var actionHandler;
        var Errors;
        var thrown;
        var nextFn = function () {};

        beforeEach("ActionHandler beforeEach", function() {
            Errors = helper.injector.get('Errors');
            actionHandler = messageHandler.createActionHandler(packetData);
            sinon.stub(actionHandler, 'getDefaultBootfile');
            thrown = false;
        });

        it("should resolve default bootfile on discover action", function() {
            var testDefaultBootfile = 'test-default-bootfile';
            actionHandler.getDefaultBootfile.returns(testDefaultBootfile);

            return Q.resolve()
            .then(function() {
                return actionHandler.handleAction(nextFn, 'discover', undefined);
            })
            .catch(function(error) {
                thrown = true;
                expect(error).to.be.an.instanceof(Errors.BreakPromiseChainError);
            })
            .then(function() {
                expect(thrown).to.equal(true);
                return actionHandler.deferred.promise;
            })
            .then(function(out) {
                expect(out).to.equal(testDefaultBootfile);
                expect(actionHandler.getDefaultBootfile)
                    .to.have.been.calledWith(actionHandler.packetData);
            });
        });

        it("should do nothing on ignore action", function() {
            return Q.resolve()
            .then(function() {
                return actionHandler.handleAction(nextFn, 'ignore', undefined);
            })
            .catch(function(error) {
                thrown = true;
                expect(error).to.be.an.instanceof(Errors.BreakPromiseChainError);
            })
            .then(function() {
                expect(thrown).to.equal(true);
                return actionHandler.deferred.promise;
            })
            .then(function(out) {
                expect(out).to.equal(null);
            });
        });

        it("should call next on next action", function() {
            var nextOut = { action: 'test' };
            var nextStub = sinon.stub().resolves(nextOut);
            var data = 'testdata';

            return Q.resolve()
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

            return Q.resolve()
            .then(function() {
                return actionHandler.handleAction(nextFn, 'send-default-bootfile', undefined);
            })
            .catch(function(error) {
                thrown = true;
                expect(error).to.be.an.instanceof(Errors.BreakPromiseChainError);
            })
            .then(function() {
                expect(thrown).to.equal(true);
                return actionHandler.deferred.promise;
            })
            .then(function(out) {
                expect(out).to.equal(testDefaultBootfile);
                expect(actionHandler.getDefaultBootfile)
                    .to.have.been.calledWith(actionHandler.packetData);
            });
        });

        it("should resolve task-specified bootfile on send-custom-bootfile action", function() {
            var testCustomBootfile = 'test-custom-bootfile';

            return Q.resolve()
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
                return actionHandler.deferred.promise;
            })
            .then(function(out) {
                expect(out).to.equal(testCustomBootfile);
            });
        });

        it("should throw on an unrecognized action", function() {
        });
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
            return messageHandler.getNodeAction(packetData.chaddr.address)
            .then(function() {
                expect(lookupService.macAddressToNodeId)
                    .to.have.been.calledWith(packetData.chaddr.address);
            });
        });

        it("should get the node action for a new node", function() {
            lookupService.macAddressToNodeId.rejects(new Errors.LookupError(''));

            return messageHandler.getNodeAction(packetData.chaddr.address)
            .then(function(out) {
                expect(out).to.have.property('action').that.equals('discover');
            });
        });

        it("should ignore a node on an unknown lookup failure", function() {
            lookupService.macAddressToNodeId.rejects(new Error(''));

            return messageHandler.getNodeAction(packetData.chaddr.address)
            .then(function(out) {
                expect(out).to.have.property('action').that.equals('ignore');
            });
        });

        it("should get the action for a node if it is determined to be already known", function() {
            lookupService.macAddressToNodeId.resolves(testnodeid);

            return messageHandler.getNodeAction(packetData.chaddr.address)
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
            packetData.options.userClass = 'iPXE';

            configuration.get.withArgs('server').returns('10.1.1.1');
            configuration.get.withArgs('httpPort').returns('80');
            expect(messageHandler.getDefaultBootfile(packetData)).to.equal(expectedUrl);
        });

        it("should return the profiles API with mac params for arista nodes", function() {
            var expectedUrl =
                'http://10.1.1.1:80/api/common/profiles?macs=' + packetData.chaddr.address;
            packetData.options.vendorClassIdentifier = 'Arista';

            configuration.get.withArgs('server').returns('10.1.1.1');
            configuration.get.withArgs('httpPort').returns('80');
            expect(messageHandler.getDefaultBootfile(packetData)).to.equal(expectedUrl);
        });

        it("should return the profiles API for mellanox mac addresses", function() {
            var expectedUrl = 'http://10.1.1.1:80/api/common/profiles';
            packetData.chaddr.address = '00:02:c9:00:00:00';

            configuration.get.withArgs('server').returns('10.1.1.1');
            configuration.get.withArgs('httpPort').returns('80');
            expect(messageHandler.getDefaultBootfile(packetData)).to.equal(expectedUrl);
        });

        it("should return intel.ipxe for intel mac addresses", function() {
            packetData.chaddr.address = 'ec:a8:6b:00:00:00';
            expect(messageHandler.getDefaultBootfile(packetData)).to.equal('intel.ipxe');
        });

        it("should return the default ipxe script if no special cases are met", function() {
            packetData.options.vendorClassIdentifier = 'testVendorClass';
            expect(messageHandler.getDefaultBootfile(packetData)).to.equal('renasar.ipxe');
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

        it("should call the send callback with a response packet", function() {
            var stubCallback = sinon.stub();
            var bootfile = 'testbootfile';
            packetUtil.createProxyDhcpAck.returns({ fname: bootfile });
            messageHandler.getBootfile.resolves(bootfile);

            return messageHandler.handleDhcpPacket(null, stubCallback)
            .then(function() {
                expect(packetUtil.createProxyDhcpAck).to.have.been.calledWith(bootfile);
                expect(stubCallback).to.have.been.calledWith({ fname: bootfile });
            });
        });
    });
});
