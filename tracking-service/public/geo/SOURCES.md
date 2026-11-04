# World land base map

Source: https://naturalearth.s3.amazonaws.com/110m_physical/ne_110m_land.zip (Natural Earth 4.1.0, converted from the official land shapefile; archive SHA-256 1926c621afd6ac67c3f36639bb1236134a48d82226dc675d3e3df53d02d2a3de)

Natural Earth 1:110m land, public domain. [Terms](https://www.naturalearthdata.com/about/terms-of-use/). No administrative borders.

SHA-256 of source GeoJSON: `ca1e9b16e25a535286124a32f33ede27b9704130da6935ef4f8f29eb54539c51`

Built with `node scripts/build-logistics-basemap.mjs .tmp/logistics-world-land.geojson`. Equirectangular coordinates: x=(longitude+180)/360*1000, y=(90-latitude)/180*500. These exact equations also project the logistics nodes and connecting lines.
