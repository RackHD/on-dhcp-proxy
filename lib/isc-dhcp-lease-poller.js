// Copyright 2016, EMC, Inc.

'use strict';

var di = require('di');

module.exports = iscDhcpLeasePollerFactory;
di.annotate(iscDhcpLeasePollerFactory, new di.Provide('DHCP.iscDhcpLeasePoller'));
di.annotate(iscDhcpLeasePollerFactory, new di.Inject(
    'Services.Lookup',
    'Logger',
    'Promise',
    'Assert',
    'Tail',
    '_',
    'PromiseQueue'
));

function iscDhcpLeasePollerFactory(
    lookupService,
    Logger,
    Promise,
    assert,
    Tail,
    _,
    PromiseQueue
) {
    var logger = Logger.initialize(iscDhcpLeasePollerFactory);

    /**
     *
     * @param {Object} options
     * @param {Object} context
     * @constructor
     */
    function IscDhcpLeasePoller(options, context) {
        var self = this;
        assert.func(self._run);
        assert.func(self.run);

        assert.object(options);
        assert.object(context);

        self.options = options;
        self.context = context;

        self._deferred = new Promise(function(resolve, reject) {
            self.resolve = resolve;
            self.reject = reject;
        });

        if (!this.options.leasesFile) {
            if (this.getPlatform() === 'darwin') {
                this.options.leasesFile = '/var/db/dhcpd.leases';
            } else if (this.getPlatform() === 'linux') {
                this.options.leasesFile = '/var/lib/dhcp/dhcpd.leases';
            } else {
                throw new Error('Unsupported platform type ' + process.platform);
            }
        }

        this.queue = new PromiseQueue();

    }

    IscDhcpLeasePoller.prototype.getPlatform = function () {
        return process.platform;
    };

    IscDhcpLeasePoller.prototype.run = function () {
        var self = this;

        logger.debug("Running DHCP Lease Poller.");

        self._run();
        return self._deferred;
    };

    /**
     * @memberOf IscDhcpLeasePoller
     */
    IscDhcpLeasePoller.prototype._run = function() {
        var self = this;

        self.queue.on('error', self._queueError.bind(self));
        self.queue.start();

        self.tail = new Tail(self.options.leasesFile, '}', {}, true);
        self.tail.on('line', self._onLine.bind(self));
        self.tail.on('error', self._tailError.bind(self));
        self.tail.watch();
    };

    IscDhcpLeasePoller.prototype._onLine = function (data) {
        var self = this;

        Promise.try(function () {
            var lease = self.parseLeaseData(data.toString());
            
            if (!_.isUndefined(lease)) {
                self.queue.enqueue(
                    lookupService.setIpAddress.bind(
                        lookupService,
                        lease.ip,
                        lease.mac
                    )
                );
            }
        }).catch(function (error) {
            logger.error(error.message, { error: error });
        });
    };

    IscDhcpLeasePoller.prototype._queueError = function (error) {
        logger.error('Queue Error', { error: error });
    };

    IscDhcpLeasePoller.prototype._tailError = function (error) {
        logger.error('Tail Error', { error: error });
    };

    IscDhcpLeasePoller.prototype._cleanup = function() {
        if (this.tail) {
            this.tail.unwatch();
            this.tail = undefined;
        }

        this.queue.stop();
    };

    IscDhcpLeasePoller.prototype.parseLeaseData = function(data) {
        /*
         * SAMPLE ISC DHCP LEASE FILE
         *
         *  # The format of this file is documented in the dhcpd.leases(5) manual page.
         *  # This lease file was written by isc-dhcp-4.3.2
         *
         *  lease 10.1.1.3 {
         *    starts 1 2015/04/20 21:14:52;
         *    ends 1 2015/04/20 21:24:52;
         *    cltt 1 2015/04/20 21:14:52;
         *    binding state active;
         *    next binding state free;
         *    rewind binding state free;
         *    hardware ethernet 08:00:27:9b:d9:f8;
         *    set vendor-class-identifier = "PXEClient:Arch:00000:UNDI:002001";
         *  }
         *  lease 10.1.1.4 {
         *    starts 1 2015/04/20 21:14:52;
         *    ends 1 2015/04/20 21:24:52;
         *    cltt 1 2015/04/20 21:14:52;
         *    binding state active;
         *    next binding state free;
         *    rewind binding state free;
         *    hardware ethernet 08:00:27:a4:f4:bb;
         *    set vendor-class-identifier = "PXEClient:Arch:00000:UNDI:002001";
         *  }
        */
        var split = data.split('\n');
        var lease;
        var currentTime = new Date();
        var expired = true;  //Default is true

       //look at/var/lib/dhcp/dhcpd.leases to find leases

        _.reduce(split, function(ip, line) {
            if (!line || line.startsWith('#') || line.startsWith('}')) {
                return ip;
            }

            line = line.trim();

            if (line.startsWith('lease')) {
                ip = line.split(' ')[1];
                return ip;
            }

            if(line.startsWith('ends')) {
                // slice off the to just get the date and time
                var expirationTime = new Date(line.slice(7, -1));

                //Checks to see if the lease is not expired.
                if(expirationTime > currentTime) {
                    expired = false;
                }
            }

            if (line.startsWith('hardware ethernet') && ip) {
                // slice off the semicolon
                var mac = line.split(' ')[2].slice(0, -1);

                assert.isIP(ip);
                assert.isMac(mac);

                if(expired === false) {
                    lease = { mac: mac, ip: ip };
                }

                //reset Expired.
                expired = true;
            }

            return ip;
        }, null);

        return lease;
    };

    return IscDhcpLeasePoller;
}
