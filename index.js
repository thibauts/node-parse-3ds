/*
 * [1] ref : http://www.martinreddy.net/gfx/3d/3DS.spec
 *
 */
var objectAssign = require('object-assign');

var encoding;

// Those are parseable as a straight list of subchunks. 
var NON_LEAF_CHUNKS = [
  0x4D4D, // Main Chunk
  0x3D3D, // 3D Editor Chunk
  0x4100, // Triangular Mesh
  0xAFFF, // Material Block
  0xB000  // Keyframer Chunk
];

// Add here parsers for other chunk types
var CHUNK_PARSERS = {
  0x4000: parseObjectChunk,
  0x4110: parseVertexListChunk,
  0x4120: parseFaceListChunk,
  0xA000: parseMaterialNameChunk
};

var CHUNK_NAMES = {
  0x4D4D: 'Main Chunk',
  0x0002: 'Version',
  0x0100: 'Scale Factor',
  0x3D3D: '3D Editor Chunk',
  0x3D3E: 'Editor Configuration',
  0x4000: 'Object Block',
  0x4100: 'Triangular Mesh',
  0x4110: 'Vertex List',
  0x4120: 'Face List',
  0x4130: 'Faces Material',
  0x4150: 'Smoothing Group List',
  0x4140: 'Mapping Coordinates List',
  0x4160: 'Local Coordinates System',
  0x4165: 'Visibility',
  0x4600: 'Light',
  0x4610: 'Spotlight',
  0x4700: 'Camera',
  0xAFFF: 'Material Block',
  0xA000: 'Material Name',
  0xA010: 'Ambient Color',
  0xA020: 'Diffuse Color',
  0xA030: 'Specular Color',
  0xA040: 'Shininess',
  0xA041: 'Shininess Strength',
  0xA050: 'Transparency',
  0xA052: 'Transparency Falloff',
  0xA053: 'Reflect Blur',
  0xA081: 'Two Sided', 
  0xA084: 'Self Illumination',
  0xA087: 'Wire Thickness',
  0xA08A: 'Transparency Falloff IN',
  0xA100: 'Material Type',
  0xA200: 'Texture Map 1',
  0xA210: 'Opacity',
  0xA230: 'Bump Map',
  0xA220: 'Reflection Map',
  0xA300: 'Mapping Filename',
  0xA351: 'Mapping Parameters',
  0xB000: 'Keyframer Chunk',
  0xB002: 'Mesh Information Block',
  0xB003: 'Camera Information Block',
  0xB004: 'Target Node Block',
  0xB005: 'Light Node Block',
  0xB006: 'Light Target Information Block',
  0xB007: 'Spot Light Information Block',
  0xB008: 'Frames (Start and End)',
  0xB009: 'Keyframe Current Time',
  0xB00A: 'Keyframes Header',
  0xB010: 'Object Name',
  0xB013: 'Object Pivot Point',
  0xB020: 'Position Track',
  0xB021: 'Rotation Track',
  0xB022: 'Scale Track',
  0xB030: 'Hierarchy Position'
};


function parseMaterialNameChunk(buf) {
  return {
    materialName: fromASCIIZ(buf)
  };
}


function parseFaceListChunk(buf) {
  var faceCount = buf.readUInt16LE(0);

  // The face array contains 3 vertex indices + a 2 bytes 
  // bit-field containing various flags (see [1]).
  // The flags don't look very useful for now, so let's remove them
  // and return a directly usable buffer instead.

  var data = buf.slice(2);
  var faces = [];

  for(var i=0; i<faceCount; i++) {
    var off = i * 2 * 4;
    faces.push(data.slice(off, off + 2 * 3));
  }

  // The face indices are returned as an UInt16LE buffer 
  return {
    faceCount: faceCount,
    faces: Buffer.concat(faces)
  };
}


function parseVertexListChunk(buf) {
  var vertexCount = buf.readUInt16LE(0);
  var vertices = buf.slice(2);

  // The vertice coordinates are returned as a Float32LE buffer 
  return {
    vertexCount: vertexCount,
    vertices: vertices
  };
}


/** Read a zero-terminated string in 'encoding' format from 'buf'.
 * @param buf The input buffer containing the bytes to decode.
 * @param obj if provided, the number of bytes read (including the final 0) will be returned as obj.count.
 * @returns the parsed string.
 */
function fromASCIIZ(buf, obj) {
  var i = 0;
  while(buf[i] != 0) {
    i++;
  }

  if (obj) {
    obj.count = i;
  }

  return buf.slice(0, i).toString(encoding);
}


function parseObjectChunk(buf) {
  // The object chunk starts with the object name
  // as a zero terminated ASCII string
  var  obj= {}
  var objectName = fromASCIIZ(buf, obj);
  var data = buf.slice(obj.count + 1);

  return {
    objectName: objectName,
    children: parseChildren(data)
  };
}


function parseChildren(buf) {
  var offset = 0;
  var children = [];

  while(offset < buf.length) {
    var chunk = parseChunk(buf, offset);
    children.push(chunk);
    offset += chunk.length;
  }

  return children;
}


function parseChunk(buf, offset) {
  var chunkId = buf.readUInt16LE(offset);
  var chunkLength = buf.readUInt32LE(offset + 2);
  var data = buf.slice(offset + 6, offset + chunkLength);

  var chunkName = CHUNK_NAMES[chunkId] || 'Unknown';

  var chunk = {
    id: chunkId,
    name: chunkName,
    length: chunkLength
  };

  /*
   * If a parser is defined for this chunkId, use it.
   * Else if the chunk is known as non-leaf, try to parse it as a list of children chunks
   */
  if(CHUNK_PARSERS[chunk.id]) {
    var parsed = CHUNK_PARSERS[chunk.id](data);
    chunk = objectAssign({}, chunk, parsed);
  } else if(NON_LEAF_CHUNKS.indexOf(chunk.id) !== -1) {
    chunk.children = parseChildren(data);
  } else {
    // Keep raw data if unparsed node has no children
    chunk.data = data;
  }

  return chunk;
}


function getChildChunk(tree, id) {
  var chunks = getChildrenChunks(tree, id);
  
  if (chunks.length === 1) {
    res= chunks[0];
  }else if (chunks.length > 1) {
   console.log("ERROR: More than one "+CHUNK_NAMES[chunks.id]+" in object.");
   var res = null;
  }else{
   //console.log("ERROR: Did not find ID "+id+" in "+tree.objectName)
  }

  return res;
}


function getChildrenChunks(tree, id) {
 
  return tree.children.filter(function(chunk) {
    return chunk.id === id;
  });
}


function unpackVertices(buf) {
  var vertexCount = buf.length / (3 * 4);
  var vertices = [];

  for(var i=0; i<vertexCount; i++) {
    var off = i * 3 * 4;
    vertices.push([
      buf.readFloatLE(off + (0 * 4)),
      buf.readFloatLE(off + (1 * 4)),
      buf.readFloatLE(off + (2 * 4)),
      ]);
  }

  return vertices;
}


function unpackFaces(buf) {
  var faceCount = buf.length / (3 * 2);
  var faces = [];

  for(var i=0; i<faceCount; i++) {
    var off = i * 3 * 2;
    faces.push([
      buf.readUInt16LE(off + (0 * 2)),
      buf.readUInt16LE(off + (1 * 2)),
      buf.readUInt16LE(off + (2 * 2)),
      ]);
  }

  return faces;
}


module.exports = function(buf, opts) {
   
   // Default is: return objects, do not return chuncks tree
   opts = opts || {}
   var returnObjects = opts.objects == undefined ? true : opts.objects;
   var returnTree = opts.tree == undefined ? false : opts.tree;
   encoding = opts.encoding == undefined ? 'binary' : opts.encoding;

   var result = {}

 var rootChunk = parseChunk(buf, 0);
 if (returnObjects) {
  var editorChunk = getChildChunk(rootChunk, 0x3D3D)
  var objectChunks = getChildrenChunks(editorChunk, 0x4000);
  var meshedObjectChunks = objectChunks;
  
  
  for (var i=0; i < objectChunks.length; i++) {
   if (!(objectChunks[i]["children"][0].name === "Triangular Mesh")) {
     meshedObjectChunks.splice(i,1);
   }
  }
   result.objects = meshedObjectChunks.map(function(meshedChunk) {
     var triMeshChunk = getChildChunk(meshedChunk, 0x4100);
     var vertexListChunk = getChildChunk(triMeshChunk, 0x4110);
     var faceListChunk = getChildChunk(triMeshChunk, 0x4120);

     return {
      
         name: meshedChunk.objectName,
         noVertices: vertexListChunk===undefined ? 0 : unpackVertices(vertexListChunk.vertices).length,
         vertices: vertexListChunk===undefined ? null : unpackVertices(vertexListChunk.vertices),
         noFaces: faceListChunk===undefined ? 0 : unpackFaces(faceListChunk.faces).length,
         faces: faceListChunk===undefined ? null : unpackFaces(faceListChunk.faces)

     };
   });
 }

 if (returnTree) {
   result.tree = rootChunk;
 }

 return result;
};

