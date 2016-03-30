#!/bin/sh

# Ensure we're always in the right directory.
SCRIPT_DIR="$( cd "$( dirname "$0" )" && pwd )"
cd $SCRIPT_DIR/..

rm -rf *.deb deb/
rm -rf node_modules/
rm -rf test/
rm commitstring.txt
rm -rf on-*.tar.gz*
rm -rf on-*.build
rm -rf on-*.dsc
rm -rf *.build
rm -rf packagebuild/
