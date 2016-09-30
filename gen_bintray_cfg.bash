#!/bin/bash
#############################################################################
#
#  This script will generate bintray config for TravisCI, based a template .in file.
#  specifically, this script will point the bintray config to correct bintray repo,
#  and use an identical package name as version control.
#
#  PARAM {1} : Branch . it's used to find corresponding bintray repo and name a package
#
############################################################################
set -e

BRANCH=${1}

if [ ! -n "$BRANCH" ]; then
    echo "[Error] The first parameter should be given. it's the BRANCH which you are standing on."
    exit 1
fi


#################################################################
#
# The Bintray Packages Version "REPO_PKGVER" is:
#
#     branch +   last-commit-date + last-commit-hash
#
##################################################################
REPO_COMMIT_DATE=`git log -1 --pretty=format:%ci  |awk '{print $1}' `
REPO_COMMIT_HASH=`git log -1 --pretty=format:%h `
REPO_PKGVER=${BRANCH}-${REPO_COMMIT_DATE}-${REPO_COMMIT_HASH}


###################################################################
#  for example, if build from master branch:
#  the debian target repo is: $DEB_REPO_PREFIX     + master.
#  the static  target repo is: $STATIC_REPO_PREFIX + master
#
#  Important NOTE: Before the TravisCI runs, user should ensure that the above repos exist.
#            Travis CI will NOT create a repo for you. but only will create a package/version for you.
#
##################################################################
STATIC_REPO_PREFIX="static-"
DEB_REPO_PREFIX="deb-"

##################################################################
# replace the reserved fields Surrounding by '##'
#
# typically 
#       - #STATIC_REPO_NAME#   : static images repo name in bintray, the type is generic
#       - #DEB_REPO_NAME#      : debian repository name in bintray
#       - #REVISION#           : a new package version (Note the Package term in Bintray)
#
##################################################################
for template in $(ls -a .bintray*.in); do
    sed  -e "s/#STATIC_REPO_NAME#/${STATIC_REPO_PREFIX}${BRANCH}/g" \
         -e    "s/#DEB_REPO_NAME#/${DEB_REPO_PREFIX}${BRANCH}/g" \
         -e         "s/#REVISION#/${REPO_PKGVER}/g"  \
         ${template}       > ${template%.*}

    cat ${template%.*}   # ${filename%.*} aims to remove the last ".in" prefix of the template file
done




