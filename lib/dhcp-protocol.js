/*
Copyright (c) 2011-2014 Andrew Paprocki

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE
 */

// Modified from http://github.com/apaprocki/node-dhcpjs

"use strict";

var di = require('di');

module.exports = ProtocolFactory;
di.annotate(module.exports, new di.Provide('DHCP.protocol'));
function ProtocolFactory() {
    var createEnum = function (v, n) {
        function Enum(value, name) {
            this.value = value;
            this.name = name;
        }

        Enum.prototype.toString = function () {
            return this.name;
        };
        Enum.prototype.valueOf = function () {
            return this.value;
        };
        return Object.freeze(new Enum(v, n));
    };

    var createHardwareAddress = function (t, a) {
        return Object.freeze({type: t, address: a});
    };

    var protocol = {
        createHardwareAddress: createHardwareAddress,

        BOOTPMessageType: Object.freeze({
            BOOTPREQUEST: createEnum(1, 'BOOTPREQUEST'),
            BOOTPREPLY: createEnum(2, 'BOOTPREPLY'),
            get: function (value) {
                for (var key in this) {
                    if (this.hasOwnProperty(key)) {
                        var obj = this[key];
                        // NOTE: DO NOT MAKE THIS TRIPLE EQUALS
                        if (obj == value) {  // jshint ignore:line
                            return obj;
                        }
                    }
                }
                return undefined;
            }
        }),

        // rfc1700 hardware types
        ARPHardwareType: Object.freeze({
            HW_ETHERNET: createEnum(1, 'HW_ETHERNET'),
            HW_EXPERIMENTAL_ETHERNET: createEnum(2, 'HW_EXPERIMENTAL_ETHERNET'),
            HW_AMATEUR_RADIO_AX_25: createEnum(3, 'HW_AMATEUR_RADIO_AX_25'),
            HW_PROTEON_TOKEN_RING: createEnum(4, 'HW_PROTEON_TOKEN_RING'),
            HW_CHAOS: createEnum(5, 'HW_CHAOS'),
            HW_IEEE_802_NETWORKS: createEnum(6, 'HW_IEEE_802_NETWORKS'),
            HW_ARCNET: createEnum(7, 'HW_ARCNET'),
            HW_HYPERCHANNEL: createEnum(8, 'HW_HYPERCHANNEL'),
            HW_LANSTAR: createEnum(9, 'HW_LANSTAR'),
            get: function (value) {
                for (var key in this) {
                    if (this.hasOwnProperty(key)) {
                        var obj = this[key];
                        // NOTE: DO NOT MAKE THIS TRIPLE EQUALS
                        if (obj == value) {  // jshint ignore:line
                            return obj;
                        }
                    }
                }
                return undefined;
            }
        }),

        // rfc1533 code 53 dhcpMessageType
        DHCPMessageType: Object.freeze({
            DHCPDISCOVER: createEnum(1, 'DHCPDISCOVER'),
            DHCPOFFER: createEnum(2, 'DHCPOFFER'),
            DHCPREQUEST: createEnum(3, 'DHCPREQUEST'),
            DHCPDECLINE: createEnum(4, 'DHCPDECLINE'),
            DHCPACK: createEnum(5, 'DHCPACK'),
            DHCPNAK: createEnum(6, 'DHCPNAK'),
            DHCPRELEASE: createEnum(7, 'DHCPRELEASE'),
            get: function (value) {
                for (var key in this) {
                    if (this.hasOwnProperty(key)) {
                        var obj = this[key];
                        // NOTE: DO NOT MAKE THIS TRIPLE EQUALS
                        if (obj == value) {  // jshint ignore:line
                            return obj;
                        }
                    }
                }
                return undefined;
            }
        })
    };

    return protocol;
}
