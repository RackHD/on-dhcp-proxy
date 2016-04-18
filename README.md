# on-dhcp-proxy [![Build Status](https://travis-ci.org/RackHD/on-dhcp-proxy.svg?branch=master)](https://travis-ci.org/RackHD/on-dhcp-proxy) [![Code Climate](https://codeclimate.com/github/RackHD/on-dhcp-proxy/badges/gpa.svg)](https://codeclimate.com/github/RackHD/on-dhcp-proxy) [![Coverage Status](https://coveralls.io/repos/RackHD/on-dhcp-proxy/badge.svg?branch=master&service=github)](https://coveralls.io/github/RackHD/on-dhcp-proxy?branch=master)

`on-dhcp-proxy` provides a DHCP proxy service for enabling the RackHD PXE workflow engine to operate with an existing DHCP server.

Copyright 2015, EMC, Inc.

# Setup

To run on-dhcp-proxy as a standalone service, it requires isc-dhcp-server to be
running in the background.

To install isc, run `sudo apt-get install isc-dhcp-server`, or on OSX, `brew install isc-dhcp`

NOTE: You must be running version isc-dhcpd-4.3.1 or greater. You can check with:

```
sudo dhcpd --version
```

To configure isc-dhcp-server on linux, add this line to /etc/default/isc-dhcp-server (not necessary on OSX):

```
INTERFACES=<interface/s you want to serve DHCP on>
```

Now add these options to dhcpd.conf for our code to work properly with isc-dhcp (NOTE: this must be above your subnet declaration):

```
ignore-client-uids true;
deny duplicates;
```

Then add your subnet configurations to /etc/dhcp/dhcpd.conf on linux, or /etc/dhcpd.conf on OSX.

```
subnet 10.1.1.0 netmask 255.255.255.0 {
  range 10.1.1.2 10.1.1.254;
  # Use this option to signal to the PXE client that we are doing proxy DHCP
  option vendor-class-identifier "PXEClient";
}
```

For an example configuration file, see dhcpd.conf in this directory.

To run isc-dhcp-server:

`$ sudo dhcpd`

To stop isc-dhcp-server:

`$ sudo killall dhcpd`

Lease information is stored in /var/lib/dhcp/dhcpd.leases on linux, and /var/db/dhcpd.leases on OSX.

## CI/testing

The unit tests can be run with standard node tools:

    npm test

`./HWIMO-TEST` will run local tests, and was built for running on a jenkins build slave, and will run the tests, jshint, and code coverage all together.

## Building

Unversioned packages are built automatically from travis-ci and uploaded to bintray.com. Using
this repository is detailed in [the docs](http://rackhd.readthedocs.org/en/latest/rackhd/ubuntu_package_installation.html).

Build scripts are placed in the `extra/` directory.

  * `.travis.yml` will call the appropriate scripts in `extra/` to build an unversioned package.
  * `extra/make-sysdeps.sh` can be used to install system level packages in a Ubuntu system.
  * `extra/make-cicd.sh` will perform all the necessary build steps to generate a version package.

If you want to build your own versioned packages, you can use the Vagrantfile provided in `extra/`.  Simply perform `vagrant up` and it will run all the necessary steps.
