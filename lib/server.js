// Copyright 2015, EMC, Inc.

"use strict";

var di = require('di'),
    dgram = require('dgram');

module.exports = serverFactory;
di.annotate(serverFactory, new di.Provide('DHCP.Proxy.Server'));
di.annotate(serverFactory, new di.Inject(
        'Services.Core',
        'DHCP.messageHandler',
        'DHCP.iscDhcpLeasePoller',
        'Logger'
    )
);
function serverFactory(core, messageHandler, iscDhcpLeasePoller, Logger) {
    var logger = Logger.initialize(Server);

    function Server(inPort, outPort, address) {
        this.server = dgram.createSocket('udp4');
        this.inPort = inPort;
        this.outPort = outPort.LegacyPort;
        this.outportEFI = outPort.EFIPort;
        this.address = address;
    }

    Server.prototype.send = function(data) {
        var packetBuffer = data.packetBuffer;
        var destination = data.destination;
        var currentOutport = this.outPort;
        var sendCallback = function(err) {
            if (err) {
                logger.error('Error sending packet: ' + err);
            }
        };
        if (data.isefi === true) {
            currentOutport = this.outportEFI;
        }
        logger.debug('current OutPort => %d'.format(currentOutport));
        this.server.send(packetBuffer, 0, packetBuffer.length, currentOutport,
                destination, sendCallback);
    };

    Server.prototype.start = function() {
        var self = this;

        self.server.on('message', function(packet) {
            messageHandler.handleDhcpPacket(packet, self.send.bind(self));
        });

        self.server.on('error', function(err) {
            logger.critical("proxyDHCP server error: ", err);
            process.nextTick(function() {
                process.exit(1);
            });
        });

        self.server.bind(self.inPort, self.address, function() {
            logger.info('proxyDHCP server is listening on %s:%s'.format(self.address, self.inPort));
            self.server.setBroadcast(true);
        });

        var DHCPPoller = new iscDhcpLeasePoller({}, {});
        DHCPPoller.run();
    };

    Server.prototype.startCore = function() {
        return core.start();
    };

    Server.prototype.stop = function() {
        this.server.close();
        this.server.removeAllListeners();
    };

    Server.create = function(inPort, outPort, address) {
        return new Server(inPort, outPort, address);
    };

    return Server;
}
