// Copyright 2015, EMC, Inc.

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
        'Services.Waterline',
        'Logger',
        'Assert',
        'Errors',
        'Promise',
        '_'
    )
);
function messageHandlerFactory(
    packetUtil,
    parser,
    lookupService,
    configuration,
    taskProtocol,
    waterline,
    Logger,
    assert,
    Errors,
    Promise,
    _
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
            assert.ok(packetData.ciaddr);
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
            logger.warning("Failed to get bootfile information for " + packetData.chaddr.address, {
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

        lookupService.macAddressToNode(macAddress)
        .then(function(node) {
            return node.discovered()
            .then(function(discovered) {
                // We only count a node as having been discovered if
                // a node document exists AND it has any catalogs
                // associated with it
                if (discovered) {
                    out.action = 'next';
                    out.data = node.id;
                } else {
                    out.action = 'discover';
                }
                resolve(out);
            });
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
            logger.debug("There is no active task assigned to node, " +
                "then check node bootSettings", { id: nodeId });

            return waterline.nodes.findByIdentifier(nodeId)
            .then(function(node) {
                if (_.has(node, 'bootSettings')) {
                    out.action = 'next';
                    out.data = nodeId;
                } else {
                    logger.debug("Ignoring DHCP requests from node, " +
                        "because it doesn't have bootSettings and active task.", { id: nodeId });
                    out.action = 'ignore';
                }
                resolve(out);
            })
            .catch(function() {
                logger.debug("Ignoring DHCP requests from node, " +
                    "because it cannot find node with identifier.", { id: nodeId });
                out.action = 'ignore';
                resolve(out);
            });
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

        logger.debug("DHCP packetData:", {
            userClass: packetData.options.userClass,
            vendorClassIdentifier: packetData.options.vendorClassIdentifier,
            archType: packetData.options.archType
        });

        // Defaults if we don't have an override from an active task
        if (packetData.options.userClass === "MonoRail") {
            return "http://" + configuration.get('apiServerAddress', '10.1.1.1') + ":" +
                           configuration.get('apiServerPort', '80') + "/api/common/profiles";
        }
        // expect to start w/ 'Arista'
        if (packetData.options.vendorClassIdentifier &&
                    packetData.options.vendorClassIdentifier.indexOf('Arista') === 0) {
            // Arista skips the TFTP download step, so just hit the
            // profiles API directly to get a profile from an active task
            // if there is one.
            return "http://" + configuration.get('apiServerAddress', '10.1.1.1') + ":" +
                           configuration.get('apiServerPort', '80') + "/api/common/profiles" +
                           "?macs=" + packetData.chaddr.address.toLowerCase();
        }
        // If the mac belongs to a mellanox card, assume that it already has
        // Flexboot and don't hand down an iPXE rom
        if (packetData.chaddr.address &&
                packetData.chaddr.address.toLowerCase().indexOf('00:02:c9') === 0) {
            return "http://" + configuration.get('apiServerAddress', '10.1.1.1') + ":" +
                           configuration.get('apiServerPort', '80') + "/api/common/profiles";
        }
        // Same bug as above but for the NICs
        if (packetData.chaddr.address &&
                packetData.chaddr.address.toLowerCase().indexOf('ec:a8:6b') === 0) {
            logger.info("Sending down monorail.intel.ipxe for mac address associated with NUCs.");
            return 'monorail.intel.ipxe';
        }

        /* Notes for UNDI
         * 1) Some NICs support UNDI driver, it needs chainload ipxe's undionly.kpxe file to bootup
         * otherwise it will hang using monorail.ipxe. NOTE: if 'UNDI' is in class identifier
         * but cannot boot for some NICs, please use MAC address or other condition to
         * judge if use monorail-undionly.kpxe or not
         *
         * 2) Some Notes from PXE spec about DHCP options:
         * PXEClient:Arch:xxxxx:UNDI:yyyzzz used for  transactions between client and server.
         * (These strings are case sensitive. This field must not be null terminated.)
         * The information from tags 93 and 94 is embedded in the Class Identifier string
         * xxxxx = Client Sys Architecture 0 . 65535
         * yyy = UNDI Major version 0 . 255
         * zzz = UNDI Minor version 0 . 255
         *
         * The Client Network Interface Identifier specifies the version of the UNDI API
         * (described below) that will support a universal network driver. The UNDI interface
         * must be supported and its version reported in tag #94.
         *
         * 3) System architecture type list from RFC4578:
         *             Type   Architecture Name
         *             ----   -----------------
         *              0    Intel x86PC
         *              1    NEC/PC98
         *              2    EFI Itanium
         *              3    DEC Alpha
         *              4    Arc x86
         *              5    Intel Lean Client
         *              6    EFI IA32
         *              7    EFI BC
         *              8    EFI Xscale
         *              9    EFI x86-64
         */
        if (packetData.options.archType === 0 &&
                packetData.options.vendorClassIdentifier &&
                packetData.options.vendorClassIdentifier.indexOf('UNDI') !== -1) {
            return 'monorail-undionly.kpxe';
        }

        if (packetData.options.vendorClassIdentifier) {
            if (packetData.options.archType === 7 || packetData.options.archType === 9) {
                return 'monorail-efi64-snponly.efi';
            }
            if (packetData.options.archType === 6) {
                return 'monorail-efi32-snponly.efi';
            }
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
            logger.debug(
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
