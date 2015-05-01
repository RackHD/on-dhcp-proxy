Setup
======

To run on-dhcp-proxy as a standalone DHCP server, it requires isc-dhcp-server to be
running in the background.

To install isc, run `sudo apt-get install isc-dhcp-server`, or on OSX, `brew install isc-dhcp`

To configure isc-dhcp-server on linux, add this line to /etc/default/isc-dhcp-server (not necessary on OSX):

```
INTERFACES=<interface/s you want to serve DHCP on>
```

Then add your subnet configurations to /etc/dhcp/dhcpd.conf on linux, or /etc/dhcpd.conf on OSX.

```
subnet 10.1.1.0 netmask 255.255.255.0 {
  range 10.1.1.2 10.1.1.254;
  # Use this option to signal to the PXE client that we are doing proxy DHCP
  option vendor-class-identifier "PXEClient";
}
```

Finally, add this option dhcpd.conf for our code to work properly with isc-dhcp:

```
deny duplicates;
```

For an example configuration file, see dhcpd.conf in this directory.

To run isc-dhcp-server:

`$ sudo dhcpd`

To stop isc-dhcp-server:

`$ sudo killall dhcpd`

Lease information is stored in /var/lib/dhcp/dhcpd.leases on linux, and /var/db/dhcpd.leases on OSX.
