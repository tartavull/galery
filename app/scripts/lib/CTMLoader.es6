// NOTE: Customized from bower version
// -- William Silversmith, June 2016

/**
 * Loader for CTM encoded models generated by OpenCTM tools:
 *	http://openctm.sourceforge.net/
 *
 * Uses js-openctm library by Juan Mellado
 *	http://code.google.com/p/js-openctm/
 *
 * @author alteredq / http://alteredqualia.com/
 */

THREE.CTMLoader = function ( showStatus ) {
	THREE.Loader.call( this, showStatus );
};

THREE.CTMLoader.prototype = Object.create( THREE.Loader.prototype );
THREE.CTMLoader.prototype.constructor = THREE.CTMLoader;

// Load multiple CTM parts defined in JSON

THREE.CTMLoader.prototype.loadParts = function(url, callback, parameters = {}) {
	var scope = this;

	var xhr = new XMLHttpRequest();

	var basePath = parameters.basePath 
		? parameters.basePath 
		: this.extractUrlBase(url);

	xhr.onreadystatechange = function () {

		if ( xhr.readyState === 4 ) {

			if ( xhr.status === 200 || xhr.status === 0 ) {

				var jsonObject = JSON.parse( xhr.responseText );

				var materials = [], geometries = [], counter = 0;

				function callbackFinal( geometry ) {

					counter += 1;

					geometries.push( geometry );

					if ( counter === jsonObject.offsets.length ) {

						callback( geometries, materials );

					}

				}


				// init materials

				for ( var i = 0; i < jsonObject.materials.length; i ++ ) {

					materials[ i ] = scope.createMaterial( jsonObject.materials[ i ], basePath );

				}

				// load joined CTM file

				var partUrl = basePath + jsonObject.data;
				var parametersPart = { useWorker: parameters.useWorker, offsets: jsonObject.offsets };
				scope.load( partUrl, callbackFinal, parametersPart );

			}
		}
	}

	xhr.open( "GET", url, true );
	xhr.setRequestHeader( "Content-Type", "text/plain" );
	xhr.send( null );
};

// Load CTMLoader compressed models
//	- parameters
//		- url (required)
//		- callback (required)

THREE.CTMLoader.prototype.load = function(url, progressCallback, callback, parameters = {}) {
	var _this = this;

	progressCallback = progressCallback || function () {};

	var xhr = new XMLHttpRequest();
	let network = 0;

	var worker;

	xhr.onreadystatechange = function () {
		if (xhr.readyState !== 4) {
			return;
		}

		if (xhr.status === 200 || xhr.status === 0) {
			var binaryData = new Uint8Array(xhr.response);

			if (parameters.useWorker) {
				worker = parameters.worker || new Worker("js/workers/CTMWorker.js");

				worker.onmessage = function (event) {
					var ctmFile = event.data[0];

					// copied from ctm.js so we can do 0 copy transfers.
					var i = ctmFile.header.triangleCount * 3,
						v = ctmFile.header.vertexCount * 3,
						n = ctmFile.body.normals ? ctmFile.header.vertexCount * 3 : 0,
						u = ctmFile.header.vertexCount * 2,
						a = ctmFile.header.vertexCount * 4,
						j = 0;

					var buffer = ctmFile.body.indices;

					ctmFile.body.indices = new Uint32Array(buffer, 0, i);
					ctmFile.body.vertices = new Float32Array(buffer, i * 4, v);
					
					if (ctmFile.body.normals) {
						ctmFile.body.normals = new Float32Array(buffer, (i + v) * 4, n);
					}

					let geometry = _this.createModel(ctmFile);

					callback(geometry);

					progressCallback({
						network: 1,
						decoded: 1,
					});
				};

				worker.postMessage({ 
					"dataBuffer": binaryData.buffer, 
					"offsets": [ 0 ],
				}, [ binaryData.buffer ]); // zero copy xfer
			} 
			else {
				var stream = new CTM.Stream(binaryData);
				stream.offset = 0;

				var ctmFile = new CTM.File( stream );

				let geometry = _this.createModel( ctmFile, callback );
				callback(geometry);

				progressCallback({
					network: 1,
					decoded: 1,
				});
			}
		} 
		else {
			console.error( "Couldn't load [" + url + "] [" + xhr.status + "]" );

			progressCallback({
				network: -1,
				decoded: 1,
			});
		}
	}

	xhr.onprogress = function (evt) {
		if (evt.lengthComputable) {
			network = evt.loaded / evt.total;
		}
		else {
			network = -1;
		}

		progressCallback({
			network: network,
			decoded: 0,
		});
	};

	xhr.onerror = function (evt) {
		console.log(evt);

		progressCallback({
			network: -1,
			decoded: 1,
		});
	};

	xhr.open("GET", url, true);
	xhr.responseType = "arraybuffer";

	xhr.send(null);	

	return worker;
};


THREE.CTMLoader.prototype.createModel = function ( file, callback ) {

	var Model = function () {

		THREE.BufferGeometry.call( this );

		this.materials = [];

		var indices = file.body.indices,
		positions = file.body.vertices,
		normals = file.body.normals;

		var uvs, colors;

		var uvMaps = file.body.uvMaps;

		if ( uvMaps !== undefined && uvMaps.length > 0 ) {

			uvs = uvMaps[ 0 ].uv;

		}

		var attrMaps = file.body.attrMaps;

		if ( attrMaps !== undefined && attrMaps.length > 0 && attrMaps[ 0 ].name === 'Color' ) {

			colors = attrMaps[ 0 ].attr;

		}

		this.setIndex( new THREE.BufferAttribute( indices, 1 ) );
		this.addAttribute( 'position', new THREE.BufferAttribute( positions, 3 ) );

		if ( normals !== undefined ) {

			this.addAttribute( 'normal', new THREE.BufferAttribute( normals, 3 ) );

		}

		if ( uvs !== undefined ) {

			this.addAttribute( 'uv', new THREE.BufferAttribute( uvs, 2 ) );

		}

		if ( colors !== undefined ) {

			this.addAttribute( 'color', new THREE.BufferAttribute( colors, 4 ) );

		}

	}

	Model.prototype = Object.create( THREE.BufferGeometry.prototype );
	Model.prototype.constructor = Model;

	var geometry = new Model();

	// compute vertex normals if not present in the CTM model
	if ( geometry.attributes.normal === undefined ) {
		geometry.computeVertexNormals();
	}

	return geometry;
};