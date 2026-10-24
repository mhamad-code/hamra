#!/bin/bash
cd ~/mahmoud-site
V=$(date +%s)
sed -i -E "s#(from \"\./[a-z-]+\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#g" js/*.js
sed -i -E "s#(src=\"js/app\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#; s#(href=\"css/(style|print)\.css)(\?v=[0-9]+)?\"#\1?v=$V\"#g" index.html
sed -i -E "s#const CACHE = \"[^\"]*\"#const CACHE = \"tm-$V\"#" sw.js
git add -A
git commit -m "تحديث $V"
git push
