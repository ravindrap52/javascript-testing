const geolib = require('geolib');
const Crawler = require('crawler');
const fs = require('fs-extra');
const path = require('path');
const childProcess = require('child_process');
const { json } = require('express');

function lon2tile(lon, zoom) {
	return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}
function lat2tile(lat, zoom) {
	return Math.floor(
		((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
			Math.pow(2, zoom)
	);
}
function tile2lon(x, z) {
	return (x / Math.pow(2, z)) * 360 - 180;
}
function tile2lat(y, z) {
	var n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
	return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}
/* eslint-enable */

function findMinMax(arr, key) {
	let min = arr[0];
	let max = arr[0];
	for (let i = 1, len = arr.length; i < len; i++) {
		const v = arr[i];
		min = v[key] < min[key] ? v : min;
		max = v[key] > max[key] ? v : max;
	}
	return [min, max];
}
/**
 * This function will collect all the tiles in gejson polygon (only the coordinate array)
 * This minZoom is the first zoom level where any edge of a tile is within the polygon bounds
 * @param {Array} polygonCoords `[[lng,lat], ...]`
 * @param {Number} maxZoom a number between 0 and 18
 * @return {Object} all infromation in one object `{ paths, allPaths, minZoom, bounds, center }`
 */
function getTileInformation(polygonCoords, maxZoom) {
	const paths = [];
	const allPaths = [];
	const tilesInGeoFence = {};
	const bounds = geolib.getBounds(polygonCoords);
	const center = geolib.getCenter(polygonCoords);
	let minZoom = 0;
	for (let zoom = 0; zoom <= maxZoom; ++zoom) {
		const zoomBounds = {
			minLat: lat2tile(bounds.maxLat, zoom),
			maxLat: lat2tile(bounds.minLat, zoom),
			minLng: lon2tile(bounds.minLng, zoom),
			maxLng: lon2tile(bounds.maxLng, zoom),
		};
		for (let y = zoomBounds.minLat; y <= zoomBounds.maxLat; ++y) {
			for (let x = zoomBounds.minLng; x <= zoomBounds.maxLng; ++x) {
				// Calculate the tile bounds
				const tb = {
					n: tile2lat(y, zoom),
					s: tile2lat(y + 1, zoom),
					w: tile2lon(x, zoom),
					e: tile2lon(x + 1, zoom),
				};
				const divideBy = 3;
				const partialDistanceNS = (tb.n - tb.s) / divideBy;
				const partialDistanceEW = (tb.e - tb.w) / divideBy;
				const pointsOnTileBorder = [];
				[...Array(divideBy + 1).keys()].forEach(index => {
					pointsOnTileBorder.push([tb.w + index * partialDistanceEW, tb.s]);
				});
				[...Array(divideBy + 1).keys()].forEach(index => {
					pointsOnTileBorder.push([tb.w + index * partialDistanceEW, tb.e]);
				});
				[...Array(divideBy + 1).keys()].forEach(index => {
					pointsOnTileBorder.push([tb.w, tb.s + index * partialDistanceNS]);
				});
				[...Array(divideBy + 1).keys()].forEach(index => {
					pointsOnTileBorder.push([tb.e, tb.s + index * partialDistanceNS]);
				});
				// console.log('pointsOnTileBorder', pointsOnTileBorder);
				// process.exit();
                // const corners = [[tb.w, tb.n], [tb.e, tb.n], [tb.w, tb.s], [tb.e, tb.s]];
				const isTileInGeoFence = pointsOnTileBorder.some(point => {
					const res = geolib.isPointInPolygon (point, polygonCoords);
					return res;
				}); // -> true
				const url = `${zoom}/${x}/${y}.png`;
				// Only tiles that are within the geo fence
				if (isTileInGeoFence) {
					if (!tilesInGeoFence[zoom]) tilesInGeoFence[zoom] = [{ x, y }];
					else tilesInGeoFence[zoom].push({ x, y });
					paths.push(url);
					if (!minZoom) minZoom = zoom;
				}
				// allPaths are all tiles that are in a rectangle that encloses the geo fence
				allPaths.push(url);
			}
		}
	}
	// const pathsWithPadding = [];
	const n = 1;
	// Create a padding of of 3 tiles around geo fence

	const tileArrayNew = Object.entries(tilesInGeoFence).map(([zoom,tile], index) => {
		let tempArray = [];
		if(index === 1) {
			// console.log('checking index 1');
			const [minX, maxX] = findMinMax(tile, 'x');
			const [minY, maxY] = findMinMax(tile, 'y');
			const minXValue = minX.x;
			const maxXValue = maxX.x;
			const minYValue = minY.y;
			const maxYValue = maxY.y;
			//left
			for(let i=0; i<(maxYValue - minYValue)+3; i++) {
				tempArray.push({
					x: minXValue - 1,
					y: minYValue -1 + i
				});
			}
		
			// right
			for(let i=0; i<(maxYValue - minYValue)+3; i++) {
				tempArray.push({
					x: maxXValue + 1,
					y: minYValue -1 + i
				});
			}
			//top
			for(let i=0; i<(maxXValue - minXValue)+3; i++) {
				tempArray.push({
					x: minXValue - 1 + i,
					y: minYValue -1 
				});
			}
			

			//bottom
			for(let i=0; i<(maxXValue - minXValue)+3; i++) {
				tempArray.push({
					x: minXValue - 1 + i,
					y: maxYValue + 1 
				});
			}

			tempArray.splice((tempArray.length),0, ...tile);





			
		
		console.log('tempArray');
		console.log(tempArray);
	}
	});
	const pathsWithPadding = Object.entries(tilesInGeoFence).reduce((acc, [zoom, tileList]) => {
		
	

	// return acc.concat(tileList.map(({ x, y }) => `${zoom}/${x}/${y}.png`));
	}, []);
	return { paths, allPaths, minZoom, bounds, center, pathsWithPadding };
}
function predictDownloadSize(polygonCoords, maxZoom) {
	const { paths, allPaths, pathsWithPadding } = getTileInformation(polygonCoords, maxZoom);
	return {
		minimalTiles: { count: paths.length, sizeInMb: Math.round(paths.length * 0.015 * 100) / 100 },
		allTiles: { count: allPaths.length, sizeInMb: Math.round(allPaths.length * 0.015 * 100) / 100 },
		pathsWithPadding: { count: pathsWithPadding.length, sizeInMb: Math.round(pathsWithPadding.length * 0.015 * 100) / 100 },
	};
}
/**
 * Download all tiles from a list of URLs
 * @param {[String]} urls Tile URLs to be downloaded
 * @param {[String]} paths folders for each downloaded tile, must be the same length as the `urls` parameter
 * @return {Promise} resolves when all downloads have finished
 */
function downloadTiles(urls, paths) {
	return new Promise(resolve => {
		const crawler = new Crawler({
			rateLimit: 2000,
			userAgent:
				'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) snap Chromium/79.0.3945.130 Chrome/79.0.3945.130 Safari/537.36',
			encoding: null,
			jQuery: false,
			maxConnections: 10,
			callback: (error, result, done) => {
				if (error) return void console.error(error.stack);
				fs.ensureDirSync(path.dirname(result.options.filePath));
				fs.createWriteStream(result.options.filePath).write(result.body);
				// console.log(result.options.filePath);
				done();
			},
		});
		crawler.queue(
			urls.map((uri, index) => ({
				uri,
				filePath: paths[index],
			}))
		);
		crawler.on('drain', () => {
			resolve();
		});
	});
}

async function downloadAllTiles(paths, basePath) {
	let missingPaths = paths;
	while (missingPaths) {
		missingPaths = missingPaths.filter(_path => !fs.existsSync(path.join(basePath, _path)));
		console.log(`Downloading ${missingPaths.length} files`);
		const urls = missingPaths.map(
			_path => `https://${'abc'[Math.floor(Math.random() * 3)]}.tile.openstreetmap.org/${_path}`
		);
		// return
		await downloadTiles(urls, missingPaths.map(_path => path.join(basePath, _path)));
	}
}

/**
 * Create an object with all information needed for leaflet to display the
 * offline map.
 * @param {Array} polygonCoords `[[lng,lat], ...]`
 * @param {Number} maxZoom a number between 0 and 18
 * @return {[type]} [description]
 */
function getIndexJson(polygonCoords, maxZoom) {
	if (maxZoom > 19) throw new Error('max zoom must not exeed 19 for OSM');
	const { minZoom, bounds, center } = getTileInformation(polygonCoords, maxZoom);
	const _bounds = [[bounds.maxLat, bounds.maxLng], [bounds.minLat, bounds.minLng]];
	return {
		crs: 'EPSG3857',
		bounds: _bounds,
		center: [center.latitude, center.longitude],
		maxZoom,
		minZoom,
		attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
		layers: [
			{
				bounds: _bounds,
				fileExt: 'png',
				maxZoom,
				mimeType: 'image/png',
				templateUrl: '/layer-0/{z}/{x}/{y}.png',
			},
		],
		mapLayerToExhibitionId: [null],
	};
}

/**
 * Use the linux `zip` command to create a zip file from the collected information:
 * - `getIndexJson` => create `index.json` file
 * - `getTileInformation` => `downloadTiles`
 * Uses OpenStreetMap.Mapnik tiles, this is currently hardcoded.
 * @param {Array} polygonCoords `[[lng,lat], ...]`
 * @param {Number} maxZoom a number between 0 and 18
 * @return {void}
 */
async function createZip(polygonCoords, maxZoom) {
	if (maxZoom > 19) throw new Error('max zoom must not exeed 19 for OSM');
	const basePath = path.join('F:\map', 'customMap');
	fs.ensureDirSync(basePath);
	fs.writeFileSync(
		path.join(basePath, 'index.json'),
		JSON.stringify(getIndexJson(polygonCoords, maxZoom), null, 2)
	);
	const { pathsWithPadding } = getTileInformation(polygonCoords, maxZoom);
	// console.log(`Number of all tiles: ${pathsWithPadding.length}`);
	await downloadAllTiles(pathsWithPadding, path.join(basePath, 'layer-0'));
	childProcess.execSync('zip -r custom-map.zip *', { cwd: basePath });
}

// This function runs when executed as a script.
if (require.main === module) {
	// create a polygon with http://geojson.io/
	const boundsPolygonGeoJson = require('./geo.json');
	
	// console.log(path.join('F:\map', 'customMap'));
	const coords = boundsPolygonGeoJson.features[0].geometry.coordinates[0];
	const maxZoom = 19; // 19 is the max zoom that open street map supports
	const dinfo = predictDownloadSize(coords, maxZoom);
	// console.log('dinfo', dinfo);
	const info = getIndexJson(coords, maxZoom);
	//console.log('info', info);
	createZip(coords, maxZoom);

	// const { paths } = getTileInformation(coords, 16);
	// const basePath = path.join(__dirname, 'tiles');
	// downloadTiles(
	// 	paths.map(_path => `https://${'abc'[Math.floor(Math.random() * 3)]}.tile.openstreetmap.org/${_path}`),
	// 	paths,
	// 	basePath
	// );
}

createZip([
    13.165826797485352,
    52.25171383720289
  ], 19);