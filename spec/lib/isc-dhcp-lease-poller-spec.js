// Copyright 2015, EMC, Inc.
/* jshint node:true */

'use strict';

describe('ISC DHCP Poller', function () {
    var uuid;
    var DHCPLeasePoller;

    // create a future end date
    // consider different timezone and the daylight saving, add 2 days bases on now will always
    // generate a future date if discard timezone while parsing.
    var futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 2); //add 2 days to current
    // use toISOString, it's the closest to Y-m-d H:i:s
    var newdate = futureDate.toISOString();
    // modify ISO string to get Y-m-d H:i:s
    newdate = newdate.split('.')[0].replace('T', ' ').replace(/-/g, '/');

    var leaseData = new Buffer(
        "# The format of this file is documented in the dhcpd.leases(5) manual page.\n" +
        "# This lease file was written by isc-dhcp-4.3.2\n" +
        "\n\n" +
        "lease 10.1.1.3 {\n" +
        "  starts 1 2015/04/20 21:14:52;\n" +
        "  ends 1 " + newdate +";\n" + //this has to be a future date to not be expired.
        "  cltt 1 2015/04/20 21:14:52;\n" +
        "  binding state active;\n" +
        "  next binding state free;\n" +
        "  rewind binding state free;\n" +
        "  hardware ethernet 08:00:27:9b:d9:f8;\n" +
        "  set vendor-class-identifier = \"PXEClient:Arch:00000:UNDI:002001\";\n" +
        "}\n"
    );

    var expiredLeaseData = new Buffer(
        "# The format of this file is documented in the dhcpd.leases(5) manual page.\n" +
        "# This lease file was written by isc-dhcp-4.3.2\n" +
        "\n\n" +
        "lease 10.1.1.3 {\n" +
        "  starts 1 2015/04/20 21:14:52;\n" +
        "  ends 1 2015/04/20 21:24:52;\n" +
        "  cltt 1 2015/04/20 21:14:52;\n" +
        "  binding state active;\n" +
        "  next binding state free;\n" +
        "  rewind binding state free;\n" +
        "  hardware ethernet 08:00:27:9b:d9:f8;\n" +
        "  set vendor-class-identifier = \"PXEClient:Arch:00000:UNDI:002001\";\n" +
        "}\n"
    );

    var multipleLeaseDate = new Buffer(
        "# The format of this file is documented in the dhcpd.leases(5) manual page.\n" +
        "# This lease file was written by isc-dhcp-4.3.2\n" +
        "\n\n" +
        "lease 10.1.1.3 {\n" +
        "  starts 1 2015/04/20 21:14:52;\n" +
        "  ends 1 " + newdate +";\n" + //this has to be a future date to not be expired.
        "  cltt 1 2015/04/20 21:14:52;\n" +
        "  binding state active;\n" +
        "  next binding state free;\n" +
        "  rewind binding state free;\n" +
        "  hardware ethernet 08:00:27:9b:d9:f8;\n" +
        "  set vendor-class-identifier = \"PXEClient:Arch:00000:UNDI:002001\";\n" +
        "}\n" +
        "lease 10.1.1.4 {\n" +
        "  starts 1 2015/04/20 21:14:52;\n" +
        "  ends 1 2015/04/20 21:24:52;\n" +
        "  cltt 1 2015/04/20 21:14:52;\n" +
        "  binding state active;\n" +
        "  next binding state free;\n" +
        "  rewind binding state free;\n" +
        "  hardware ethernet 09:00:27:9b:d9:f9;\n" +
        "  set vendor-class-identifier = \"PXEClient:Arch:00000:UNDI:002001\";\n" +
        "}\n"
    );

    before('ISC DHCP Lease Poller before', function () {
        // create a child injector with on-core and the base pieces we need to test this
        helper.setupInjector(
            [
                helper.require('/spec/mocks/logger.js'),
                helper.require('/lib/isc-dhcp-lease-poller')
            ]
        );

        uuid = helper.injector.get('uuid');
        var Logger = helper.injector.get('Logger');

        this.DHCPLeasePoller = helper.injector.get('DHCP.iscDhcpLeasePoller');
    });


    describe('Platform', function() {
        beforeEach(function () {
            this.sandbox = sinon.sandbox.create();
        });

        afterEach(function () {
            this.sandbox.restore();
        });

        it('should find the right lease file on linux', function() {
            this.sandbox.stub(this.DHCPLeasePoller.prototype, 'getPlatform').returns('linux');
            var _DHCPPoller = new this.DHCPLeasePoller({}, {});
            expect(_DHCPPoller.options.leasesFile).to.equal('/var/lib/dhcp/dhcpd.leases');
        });

        it('should find the right lease file on OSX', function() {
            this.sandbox.stub(this.DHCPLeasePoller.prototype, 'getPlatform').returns('darwin');
            var _DHCPPoller = new this.DHCPLeasePoller({}, {});
            expect(_DHCPPoller.options.leasesFile).to.equal('/var/db/dhcpd.leases');
        });

        it('should throw on unsupported platform', function() {
            var self = this;
            this.sandbox.stub(this.DHCPLeasePoller.prototype, 'getPlatform').returns('invalid');
            expect(function() {
                var _DHCPPoller = new self.DHCPLeasePoller({}, {});  /* jshint ignore:line */
            }).to.throw(/Unsupported platform type/);
        });

        it('should prioritize a user defined lease file', function() {
            var _DHCPPoller = new this.DHCPLeasePoller({ leasesFile: '/user/defined' }, {});
            expect(_DHCPPoller.options.leasesFile).to.equal('/user/defined');
        });
    });


    describe("Parse Lease Data", function(){
        it('should parse lease data', function() {
            var DHCPPoller = new this.DHCPLeasePoller({}, {}, uuid.v4());
            var parsed = DHCPPoller.parseLeaseData(leaseData.toString());
            expect(parsed).to.deep.equal({
                ip: '10.1.1.3',
                mac: '08:00:27:9b:d9:f8'
            });
        });

        it('should not parse an expired lease', function() {
            var DHCPPoller = new this.DHCPLeasePoller({}, {}, uuid.v4());
            var parsed = DHCPPoller.parseLeaseData(expiredLeaseData.toString());

            expect(parsed).to.be.undefined;
        });

        it('should only parse leases that are not expired', function() {
            var DHCPPoller = new this.DHCPLeasePoller({}, {}, uuid.v4());
            var parsed = DHCPPoller.parseLeaseData(multipleLeaseDate.toString());

            expect(parsed).to.deep.equal({
                ip: '10.1.1.3',
                mac: '08:00:27:9b:d9:f8'
            });
            expect(parsed).to.not.have.property('ip', '10.1.1.4');
            expect(parsed).to.not.have.property('mac', '09:00:27:9b:d9:f9');
        });

    });
});
