// Copyright 2015, Renasar Technologies Inc.
/* jshint node: true */

"use strict";

var di = require('di');

module.exports = messageHandlerFactory;
di.annotate(messageHandlerFactory, new di.Provide('DHCP.messageHandler'));
di.annotate(messageHandlerFactory, new di.Inject(
        'DHCP.packet',
        'DHCP.parser',
        'Services.Lookup',
        'Services.Configuration',
        'Protocol.Task',
        'Logger',
        'Assert',
        'Errors',
        'Promise'
    )
);
function messageHandlerFactory(
    packetUtil,
    parser,
    lookupService,
    configuration,
    taskProtocol,
    Logger,
    assert,
    Errors,
    Promise
) {
    var logger = Logger.initialize(messageHandlerFactory);

    function MessageHandler() {
    }

    MessageHandler.prototype.createActionHandler = function(packetData) {
        return new ActionHandler(packetData, this.getDefaultBootfile.bind(this));
    };

    MessageHandler.prototype.handleDhcpPacket = function(packet, sendCallback) {
        var self = this;
        var packetData;

        try {
            packetData = parser.parse(packet);
            assert.ok(packetData.chaddr.address);
        } catch (e) {
            logger.error("Error parsing DHCP packet.", { error: e });
            return;
        }

        // Speed up response time by queueing both these async actions
        return Promise.all([
            self.getBootfile(packetData),
            lookupService.setIpAddress(packetData.ciaddr, packetData.chaddr.address)
        ])
        .spread(function(bootFileName) {
            if (bootFileName) {
                var responsePacket = packetUtil.createProxyDhcpAck(packetData, bootFileName);
                sendCallback(responsePacket);
            }
        })
        .catch(function(err) {
            logger.error("Failed to get bootfile information for " + packetData.chaddr.address, {
                error: err
            });
        });
    };

    /*
     * Return the next action to take based on whether a node is known or unknown.
     *
     * @member
     * @function
     *
     * @param {String} macAddress - mac address of PXE client
     * @returns {Promise}
     */
    MessageHandler.prototype.getNodeAction = function(macAddress) {
        var resolve;
        var deferred = new Promise(function(_resolve) {
            resolve = _resolve;
        });
        var out = {};

        lookupService.macAddressToNodeId(macAddress)
        .then(function(nodeId) {
            out.action = 'next';
            out.data = nodeId;
            resolve(out);
        })
        .catch(function(err) {
            if (err instanceof Errors.NotFoundError) {
                out.action = 'discover';
                resolve(out);
            } else {
                logger.debug(
                    "Ignoring DHCP requests from node because of a lookup failure.", {
                        macaddress: macAddress,
                        error: err
                    }
                );
                out.action = 'ignore';
                resolve(out);
            }
        });

        return deferred;
    };

    /*
     * Return the next action to take based on whether a known node has an
     * active task associated with it.
     *
     * @member
     * @function
     *
     * @param {String} nodeId - nodeId used to request an active task
     * @returns {Promise}
     */
    MessageHandler.prototype.getKnownNodeAction = function(nodeId) {
        var self = this;
        var resolve;
        var deferred = new Promise(function(_resolve) {
            resolve = _resolve;
        });
        var out = {};

        taskProtocol.activeTaskExists(nodeId)
        .then(function() {
            out.action = 'next';
            out.data = nodeId;
            resolve(out);
        })
        .catch(function() {
            logger.debug(
                "Ignoring DHCP requests from node because there is " +
                "no active task assigned to it.",
                {
                    macaddress: self.packetData.chaddr.address
                }
            );
            out.action = 'ignore';
            resolve(out);
        });

        return deferred;
    };

    /*
     * Return the next action to take based on whether a known node has an
     * active task associated with it.
     *
     * @member
     * @function
     *
     * @param {String} nodeId - nodeId used to request a bootfile from the active task
     * @returns {Promise}
     */
    MessageHandler.prototype.getKnownNodeActionFromTask = function(nodeId) {
        var resolve;
        var deferred = new Promise(function(_resolve) {
            resolve = _resolve;
        });
        var out = {};

        taskProtocol.getBootProfile(nodeId)
        .then(function(bootFileName) {
            out.action = 'send-custom-bootfile';
            out.data = bootFileName;
            resolve(out);
        })
        .catch(function(error) {
            logger.warning("Could not get TFTP bootfile name from active task. " +
                "Sending default bootfile.", { error: error });
            out.action = 'send-default-bootfile';
            resolve(out);
        });

        return deferred;
    };

    /*
     * Determine the appropriate boot file name for a node based on information
     * in the DHCP packet.
     *
     * @member
     * @function
     *
     * @param {Object} packetData - A parsed DHCP packet
     * @returns {Promise}
     */
    MessageHandler.prototype.getDefaultBootfile = function(packetData) {
        assert.object(packetData);
        assert.object(packetData.options);
        assert.string(packetData.chaddr.address);

        // Defaults if we don't have an override from an active task
        if (packetData.options.userClass === "MonoRail") {
            return "http://" + configuration.get('server') + ":" +
                           configuration.get('httpPort') + "/api/common/profiles";
        }
        // expect to start w/ 'Arista'
        if (packetData.options.vendorClassIdentifier &&
                    packetData.options.vendorClassIdentifier.indexOf('Arista') === 0) {
            // Arista skips the TFTP download step, so just hit the
            // profiles API directly to get a profile from an active task
            // if there is one.
            return "http://" + configuration.get('server') + ":" +
                           configuration.get('httpPort') + "/api/common/profiles" +
                           "?macs=" + packetData.chaddr.address.toLowerCase();
        }
        // If the mac belongs to a mellanox card, assume that it already has
        // Flexboot and don't hand down an iPXE rom
        if (packetData.chaddr.address &&
                packetData.chaddr.address.toLowerCase().indexOf('00:02:c9') === 0) {
            return "http://" + configuration.get('server') + ":" +
                           configuration.get('httpPort') + "/api/common/profiles";
        }
        // Same bug as above but for the NICs
        if (packetData.chaddr.address &&
                packetData.chaddr.address.toLowerCase().indexOf('ec:a8:6b') === 0) {
            logger.info("Sending down monorail.intel.ipxe for mac address associated with NUCs.");
            return 'monorail.intel.ipxe';
        }
        if (packetData.options.vendorClassIdentifier) {
            return 'monorail.ipxe';
        }
    };

    /*
     * Determine what boot file, if any, to return to a PXE client
     *
     * @member
     * @function
     *
     * @param {Object} packetData - A parsed DHCP packet
     * @returns {Promise}
     */
    MessageHandler.prototype.getBootfile = function(packetData) {
        var self = this;
        var actionHandler = self.createActionHandler(packetData);

        self.getNodeAction(packetData.chaddr.address)
        .then(function(out) {
            return actionHandler.handleAction(self.getKnownNodeAction, out.action, out.data);
        })
        .then(function(out) {
            return actionHandler.handleAction(
                self.getKnownNodeActionFromTask, out.action, out.data);
        })
        .then(function(out) {
            return actionHandler.handleAction(self.getDefaultBootfile, out.action, out.data);
        })
        .catch(Errors.BreakPromiseChainError, function() {
            return;
        })
        .catch(function(err) {
            actionHandler.reject(err);
        });

        return actionHandler.deferred;
    };

    /*
     * A simple logic handler called at each step in the decision pipeline for
     * determining a DHCP boot file name for a node
     *
     * @constructor
     */
    function ActionHandler(packetData, getDefaultBootfileFn) {
        var self = this;
        self.deferred = new Promise(function(resolve, reject) {
            self.resolve = resolve;
            self.reject = reject;
        });
        self.packetData = packetData;
        self.getDefaultBootfile = getDefaultBootfileFn;
    }

    /*
     * @member
     * @function
     *
     * @param {Function} nextFn - next function in decision pipeline
     * @param {String} action - DHCP boot file action, if 'next' will call nextFn
     * @param {String} data - parameter to pass into nextFn if action is 'next'
     *
     * @returns {Promise}
     */
    ActionHandler.prototype.handleAction = function(nextFn, action, data) {
        assert.func(nextFn);
        assert.string(action);

        if (action === 'discover') {
            assert.object(this.packetData);
            logger.silly(
                "Unknown node %s. Sending down default bootfile."
                    .format(this.packetData.chaddr.address)
            );
            this.resolve(this.getDefaultBootfile(this.packetData));
            throw new Errors.BreakPromiseChainError();
        } else if (action === 'ignore') {
            this.resolve(null);
            throw new Errors.BreakPromiseChainError();
        } else if (action === 'next') {
            return nextFn(data);
        } else if (action === 'send-default-bootfile') {
            this.resolve(this.getDefaultBootfile(this.packetData));
            throw new Errors.BreakPromiseChainError();
        } else if (action === 'send-custom-bootfile') {
            this.resolve(data);
            throw new Errors.BreakPromiseChainError();
        } else {
            throw new Error('Unrecognized action');
        }
    };

    return new MessageHandler();
}
