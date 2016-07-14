// Copyright 2015, EMC, Inc.
/* jshint node: true */

"use strict";

describe("Server", function() {
    var server;
    var parser;
    var core;
    var packetDHCP;
    var DHCPPoller;
    var outPort =
        {
            LegacyPort: (68),
            EFIPort:(4011)
        };

    before('Server before', function() {
        helper.setupInjector([
                helper.require('/lib/server'),
                helper.require('/lib/dhcp-protocol'),
                helper.require('/lib/message-handler'),
                helper.require('/lib/isc-dhcp-lease-poller'),
                helper.require('/lib/packet'),
                helper.require('/lib/parser')
            ]);

        var Logger = helper.injector.get('Logger');
        Logger.prototype.log = sinon.stub();

        DHCPPoller = helper.injector.get('DHCP.IscDhcpLeasePoller');

        server = helper.injector.get('DHCP.Proxy.Server');
        parser = helper.injector.get('DHCP.parser');
        packetDHCP = helper.injector.get('DHCP.packet');
        core = helper.injector.get('Services.Core');
    });

    describe('Server function', function() {
        var testServer;

        before('Server function before', function() {
            testServer = new server('1',outPort,'192.4.84.7');
        }); 

        it('should have valid address',function(){
            expect(testServer.address).to.equal('192.4.84.7')
        });

        it('should have valid inPort', function(){
            expect(testServer.inPort).to.equal('1')
        });

        it('should have valid outPort', function() {
            expect(testServer.outPort).to.equal(68)
        });

        it('should have valid outportEFI', function() {
            expect(testServer.outportEFI).to.equal(4011)
        });
           
    });

    describe('Send Function', function() {
        var fakeData = {
        };
        var testServer;

        before('before Send function',function() {
            testServer = new server('1',outPort,'123.4.56.7');
            fakeData = {
                packetBuffer: 240,
                destination: '123.4.56.7',
                isefi: false 
            };

        });

        it('should Send data',function(){
            var mock = sinon.mock(testServer.server)
            mock.expects("send").once().withArgs(fakeData.packetBuffer, 0,
                                                 fakeData.packetBuffer.length,
                                                 testServer.outPort, fakeData.destination);
           
            testServer.send(fakeData);
            mock.verify(); 
        });

        it('should Send data',function(){
            var mock = sinon.mock(testServer.server)
            mock.expects("send").once().withArgs(fakeData.packetBuffer, 0,
                                                 fakeData.packetBuffer.length,
                                                 testServer.outportEFI, fakeData.destination);
            fakeData.isefi = true;          
            testServer.send(fakeData);
            mock.verify(); 
        });

        it('should Send data with error',function(){
            var Logger = helper.injector.get('Logger');
            var spy = sinon.spy(Logger.prototype, 'error');
            var stub = sinon.stub(testServer.server, 'send');
            stub.yields('err');
            testServer.send(fakeData);

            expect(stub.calledOnce);
            spy.calledWith('Error sending packet: err');
        });

    }); 

    describe('Start function', function() { 
        var testServer;
        var message = 'message';
        var error = 'error';

        before('before StartCore function', function() {
            testServer = new server('1',outPort,'123.4.56.7');

            DHCPPoller.prototype.run = sinon.stub();
        });

        it('should handle message', function() {
            var mock = sinon.mock(testServer.server);
            mock.expects('on').withArgs(message).once();
            mock.expects('on').withArgs(error).once();
            mock.expects('bind').once().withArgs('1', '123.4.56.7');
            testServer.start();
            mock.verify();
        });

        it('should handle start and bind', function() {
            var stub1 = sinon.stub(testServer.server, 'on');
            var stub2 = sinon.stub(testServer.server, 'bind');
            var stub3 = sinon.stub(testServer.server, 'setBroadcast');
            var stub4 = sinon.stub(process, 'exit');

            stub1.yields();
            stub2.yields();

            testServer.start();

            expect(stub1.calledTwice);
            expect(stub2.calledOnce);
            expect(stub3.calledWith(true));
            expect(stub4.calledWith(1));
        });

        it('should handle start and start the DHCP Lease Poller', function() {
            testServer.start();

            expect(DHCPPoller.prototype.run.calledOnce);
        });

    });    

    describe('StartCore function', function() {
        var testServer;

        before('before StartCore function', function() {
            testServer = new server('1',outPort,'123.4.56.7');
        });

        it('Should return core.start', function() {
            var stub = sinon.stub(core, 'start');
            testServer.startCore();
            expect(stub.calledOnce);
        });
 
    });
    
    describe('Stop function', function() {
        var testServer;

        before('before Stop function', function() {
            testServer = new server('1',outPort,'123.4.56.7');
        });

        it('Should close server', function() {
            var mock = sinon.mock(testServer.server);
            mock.expects('close').once();
            testServer.stop();
            mock.verify();
        });

        it('Should removeAllListeners', function() {
            var mock = sinon.mock(testServer.server);
            mock.expects('removeAllListeners').once();
            testServer.stop();
            mock.verify();
        });
    });

    describe('Create function', function() {
        it('needs tests');
    });

});
