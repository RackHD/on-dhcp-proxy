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
    Promise
) {
    var logger = Logger.initialize(messageHandlerFactory);

    function MessageHandler() {
    }

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
        return Promise.resolve()
        .then(function(){
            /*
             * Workaround for 'Intel Boot Agent' PXE boot issue that
             * no free memory when PXE boot ROM donwload files for severail times.
             * In some physical machine that use Intel Boot Agent PXE boot,
             * when the boot sequence is:
             *      NIC1 PXE boot
             *   -> Donwload iPXE bootfile, and chainload to iPXE boot for NIC1
             *   -> Noting for NIC1 iPXE boot, continue to NIC2 PXE boot
             *   -> Noting for NIC2 PXE boot, continue to NIC1 PXE boot 
             *   -> Donwload iPXE bootfile, and chainload to iPXE boot for NIC1
             *   -> .....(loop as above)
             * NIC ROM firmware will download iPXE bootfile in multiple times,
             * but memory is not freed. So after several times, no free memory left.
             * Console will show 'NBP is too big to fit in free base memory',
             * which will lead to physical machine cannot auto-boot in next time.
             *
             * Workaround this issue by a pre-check. If it's not neccesary,
             * don't need to send iPXE bootfile name to let node download bootfile.
             *
             * The pre-check could be configured so that when there's no this issue,
             * it could be disabled, and also keep the ability of separate DHCP.
             */
            var dhcpSendBootFileName = configuration.get('dhcpSendBootFileName', true);
            if(dhcpSendBootFileName) {
                return self.isBootFileNameSent(packetData);
            } else {
                return true;
            }
        })
        .then(function(isBootFileNameSent) {
            if (isBootFileNameSent) {
                return self.getDefaultBootfile(packetData);
            }
        })
        .then(function(bootFileName) {
            if (bootFileName) {
                var responsePacket = packetUtil.createProxyDhcpAck(packetData, bootFileName);
                sendCallback(responsePacket);
                logger.info(bootFileName + " name is sent to node",
                    { macaddress: packetData.chaddr.address });
            } else {
                logger.info("No bootfile name is sent to node",
                    { macaddress: packetData.chaddr.address });

            }
        })
        .catch(function(err) {
            logger.warning("Failed to get bootfile information for " + packetData.chaddr.address, {
                error: err
            });
        });
    };

    /*
     * Determine if bootfile name should be sent or not
     * in the DHCP packet.
     *
     * @param {Object} packetData - A parsed DHCP packet
     * @returns {Promise}
     */
    MessageHandler.prototype.isBootFileNameSent = function(packetData) {
        var macAddress = packetData.chaddr.address;
        return lookupService.macAddressToNode(macAddress)
        .then(function(node) {
            return node.discovered()
            .then(function(discovered) {
                if (discovered) {
                    return taskProtocol.activeTaskExists(node.id)
                    .then(function() {
                        return taskProtocol.requestProfile(node.id)
                        .then(function () {
                            logger.info("Active task exists, and profile exists",
                                { macaddress: macAddress });
                            return true;
                        })
                        .catch(function () {
                            logger.info("Active task exists, but no profile exists",
                                { macaddress: macAddress });
                            return false;
                        });
                    })
                    .catch(function(){
                        if(node.hasOwnProperty('bootSettings')) {
                            logger.info("There is bootSettings", { macaddress: macAddress });
                            return true;
                        } else {
                            logger.info("Node is discovered, but no active task and boot setttings",
                                { macaddress: macAddress });
                            return false;
                        }
                    });
                } else {
                    logger.info("Node is not discovered", { macaddress: macAddress });
                    return true;
                }
            });
        })
        .catch(function(err){
            if (err instanceof Errors.NotFoundError) {
                logger.info("There is no lookup record for this node", { macaddress: macAddress });
                return true;
            } else {
                logger.error("A lookup failure occur",
                    { macaddress: macAddress,
                      error: err });
                return false;
            }
        });
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
                           configuration.get('apiServerPort', '80') + "/api/current/profiles";
        }
        // expect to start w/ 'Arista'
        if (packetData.options.vendorClassIdentifier &&
                    packetData.options.vendorClassIdentifier.indexOf('Arista') === 0) {
            // Arista skips the TFTP download step, so just hit the
            // profiles API directly to get a profile from an active task
            // if there is one.
            return "http://" + configuration.get('apiServerAddress', '10.1.1.1') + ":" +
                           configuration.get('apiServerPort', '80') + "/api/current/profiles" +
                           "?macs=" + packetData.chaddr.address.toLowerCase();
        }
        // If the mac belongs to a mellanox card, assume that it already has
        // Flexboot and don't hand down an iPXE rom
        if (packetData.chaddr.address &&
                packetData.chaddr.address.toLowerCase().indexOf('00:02:c9') === 0) {
            return "http://" + configuration.get('apiServerAddress', '10.1.1.1') + ":" +
                           configuration.get('apiServerPort', '80') + "/api/current/profiles";
        }
        // Same bug as above but for the NICs
        if (packetData.chaddr.address &&
                packetData.chaddr.address.toLowerCase().indexOf('ec:a8:6b') === 0) {
            logger.info("Sending down monorail.intel.ipxe for mac address associated with NUCs.");
            return 'monorail.intel.ipxe';
        }

        /*
         * System architecture type list from RFC4578:
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
        if (packetData.options.vendorClassIdentifier) {
            if (packetData.options.archType === 7 || packetData.options.archType === 9) {
                return 'monorail-efi64-snponly.efi';
            }
            if (packetData.options.archType === 6) {
                return 'monorail-efi32-snponly.efi';
            }

            /* Notes for UNDI
             * 1) Some NICs support UNDI driver, it needs chainload ipxe's undionly.kpxe file to
             * bootup otherwise it will hang using monorail.ipxe. NOTE: if 'UNDI' is in class
             * identifier but cannot boot for some NICs, please use MAC address or other
             * condition to judge if use monorail-undionly.kpxe or not, or report it as a bug for
             * this NIC.
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
             */
            if (packetData.options.archType === 0 &&
                    packetData.options.vendorClassIdentifier.indexOf('PXEClient:Arch:00000:UNDI') === 0) { // jshint ignore:line
                return 'monorail-undionly.kpxe';
            }

            return 'monorail.ipxe';
        }
    };

    return new MessageHandler();
}
