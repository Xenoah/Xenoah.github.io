// qrcode.js - Minimal QR Code generator (byte mode, versions 1-10).
// Adapted from the public-domain reference algorithm by Project Nayuki
// (https://www.nayuki.io/page/qr-code-generator-library) — implemented in
// plain JavaScript and trimmed to the features needed by this app.
// Exposes globalThis.QRCodeGen = { generate(text, ecLevel) -> { size, modules } }
//
// License: MIT (Anthropic / PDF Editor app).

(function (root) {
  'use strict';

  // ---- Static tables (versions 1..10) ----

  // [ec][version] -> error correction codewords per block
  var ECC_CODEWORDS_PER_BLOCK = {
    L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
    M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
    Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
    H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
  };
  // [ec][version] -> number of error correction blocks
  var NUM_ERROR_CORRECTION_BLOCKS = {
    L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
    M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
    Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
    H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
  };

  // ---- Helpers ----

  function getNumRawDataModules(ver) {
    if (ver < 1 || ver > 40) throw new Error('Version out of range');
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  function getNumDataCodewords(ver, ec) {
    return Math.floor(getNumRawDataModules(ver) / 8) -
      ECC_CODEWORDS_PER_BLOCK[ec][ver] * NUM_ERROR_CORRECTION_BLOCKS[ec][ver];
  }

  // ---- Reed-Solomon ----

  function reedSolomonComputeDivisor(degree) {
    var result = new Array(degree).fill(0);
    result[degree - 1] = 1;
    var root = 1;
    for (var i = 0; i < degree; i++) {
      for (var j = 0; j < degree; j++) {
        result[j] = reedSolomonMultiply(result[j], root);
        if (j + 1 < degree) result[j] ^= result[j + 1];
      }
      root = reedSolomonMultiply(root, 0x02);
    }
    return result;
  }

  function reedSolomonComputeRemainder(data, divisor) {
    var result = new Array(divisor.length).fill(0);
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ result.shift();
      result.push(0);
      for (var j = 0; j < result.length; j++) {
        result[j] ^= reedSolomonMultiply(divisor[j], factor);
      }
    }
    return result;
  }

  function reedSolomonMultiply(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }

  // ---- Bit buffer ----

  function appendBits(bb, val, len) {
    for (var i = len - 1; i >= 0; i--) {
      bb.push((val >>> i) & 1);
    }
  }

  // ---- Encode byte segment ----

  function encodeByteSegment(text) {
    var bytes = [];
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c < 0x80) {
        bytes.push(c);
      } else if (c < 0x800) {
        bytes.push(0xC0 | (c >>> 6));
        bytes.push(0x80 | (c & 0x3F));
      } else if ((c & 0xFC00) === 0xD800 && i + 1 < text.length && (text.charCodeAt(i + 1) & 0xFC00) === 0xDC00) {
        var c2 = text.charCodeAt(++i);
        var u = 0x10000 + (((c & 0x3FF) << 10) | (c2 & 0x3FF));
        bytes.push(0xF0 | (u >>> 18));
        bytes.push(0x80 | ((u >>> 12) & 0x3F));
        bytes.push(0x80 | ((u >>> 6) & 0x3F));
        bytes.push(0x80 | (u & 0x3F));
      } else {
        bytes.push(0xE0 | (c >>> 12));
        bytes.push(0x80 | ((c >>> 6) & 0x3F));
        bytes.push(0x80 | (c & 0x3F));
      }
    }
    return bytes;
  }

  // ---- Build all codewords (data + EC interleaved) ----

  function buildAllCodewords(dataCodewords, version, ec) {
    var numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ec][version];
    var blockEccLen = ECC_CODEWORDS_PER_BLOCK[ec][version];
    var rawCodewords = Math.floor(getNumRawDataModules(version) / 8);
    var numShortBlocks = numBlocks - rawCodewords % numBlocks;
    var shortBlockLen = Math.floor(rawCodewords / numBlocks);

    var blocks = [];
    var rsDiv = reedSolomonComputeDivisor(blockEccLen);
    for (var i = 0, k = 0; i < numBlocks; i++) {
      var dat = dataCodewords.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
      k += dat.length;
      var ecc = reedSolomonComputeRemainder(dat, rsDiv);
      if (i < numShortBlocks) dat.push(0);
      blocks.push(dat.concat(ecc));
    }

    var result = [];
    for (var col = 0; col < blocks[0].length; col++) {
      for (var row = 0; row < blocks.length; row++) {
        if (col !== shortBlockLen - blockEccLen || row >= numShortBlocks) {
          result.push(blocks[row][col]);
        }
      }
    }
    return result;
  }

  // ---- Matrix ----

  function makeMatrix(size, fill) {
    var m = new Array(size);
    for (var i = 0; i < size; i++) m[i] = new Array(size).fill(fill);
    return m;
  }

  // ---- Drawing ----

  function drawFinderPattern(modules, isFunction, x, y) {
    for (var dy = -4; dy <= 4; dy++) {
      for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.max(Math.abs(dx), Math.abs(dy));
        var xx = x + dx, yy = y + dy;
        if (0 <= xx && xx < modules.length && 0 <= yy && yy < modules.length) {
          setFunctionModule(modules, isFunction, xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  }

  function drawAlignmentPattern(modules, isFunction, x, y) {
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        setFunctionModule(modules, isFunction, x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  function setFunctionModule(modules, isFunction, x, y, isDark) {
    modules[y][x] = isDark;
    isFunction[y][x] = true;
  }

  function getAlignmentPatternPositions(version) {
    if (version === 1) return [];
    var numAlign = Math.floor(version / 7) + 2;
    var step = (version === 32) ? 26 :
      Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
    var result = [6];
    var pos = version * 4 + 10;
    for (var i = 0; i < numAlign - 1; i++) {
      result.unshift(pos);
      pos -= step;
    }
    return result;
  }

  function drawFunctionPatterns(modules, isFunction, version) {
    var size = modules.length;
    // Timing patterns
    for (var i = 0; i < size; i++) {
      setFunctionModule(modules, isFunction, 6, i, i % 2 === 0);
      setFunctionModule(modules, isFunction, i, 6, i % 2 === 0);
    }
    // Finder patterns
    drawFinderPattern(modules, isFunction, 3, 3);
    drawFinderPattern(modules, isFunction, size - 4, 3);
    drawFinderPattern(modules, isFunction, 3, size - 4);
    // Alignment patterns
    var alignPos = getAlignmentPatternPositions(version);
    var numAlign = alignPos.length;
    for (var a = 0; a < numAlign; a++) {
      for (var b = 0; b < numAlign; b++) {
        if ((a === 0 && b === 0) || (a === 0 && b === numAlign - 1) || (a === numAlign - 1 && b === 0)) continue;
        drawAlignmentPattern(modules, isFunction, alignPos[a], alignPos[b]);
      }
    }
    // Reserve format info (overwritten later)
    drawFormatBits(modules, isFunction, 'L', 0);
    // Reserve version info for >= 7
    if (version >= 7) drawVersion(modules, isFunction, version);
  }

  function drawFormatBits(modules, isFunction, ec, mask) {
    var ecBits = { L: 1, M: 0, Q: 3, H: 2 }[ec];
    var data = (ecBits << 3) | mask;
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412;
    // First copy
    for (var j = 0; j <= 5; j++) setFunctionModule(modules, isFunction, 8, j, getBit(bits, j));
    setFunctionModule(modules, isFunction, 8, 7, getBit(bits, 6));
    setFunctionModule(modules, isFunction, 8, 8, getBit(bits, 7));
    setFunctionModule(modules, isFunction, 7, 8, getBit(bits, 8));
    for (var k = 9; k < 15; k++) setFunctionModule(modules, isFunction, 14 - k, 8, getBit(bits, k));
    // Second copy
    var size = modules.length;
    for (var m = 0; m < 8; m++) setFunctionModule(modules, isFunction, size - 1 - m, 8, getBit(bits, m));
    for (var n = 8; n < 15; n++) setFunctionModule(modules, isFunction, 8, size - 15 + n, getBit(bits, n));
    setFunctionModule(modules, isFunction, 8, size - 8, true);
  }

  function drawVersion(modules, isFunction, version) {
    if (version < 7) return;
    var rem = version;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    var bits = (version << 12) | rem;
    for (var j = 0; j < 18; j++) {
      var bit = getBit(bits, j);
      var a = modules.length - 11 + j % 3;
      var b = Math.floor(j / 3);
      setFunctionModule(modules, isFunction, a, b, bit);
      setFunctionModule(modules, isFunction, b, a, bit);
    }
  }

  function getBit(x, i) { return ((x >>> i) & 1) !== 0; }

  function drawCodewords(modules, isFunction, allCodewords) {
    var size = modules.length;
    var i = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (!isFunction[y][x] && i < allCodewords.length * 8) {
            modules[y][x] = getBit(allCodewords[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  }

  function applyMask(modules, isFunction, mask) {
    if (mask < 0 || mask > 7) throw new Error('Mask out of range');
    var size = modules.length;
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var invert;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = (x * y) % 2 + (x * y) % 3 === 0; break;
          case 6: invert = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
          case 7: invert = ((x + y) % 2 + (x * y) % 3) % 2 === 0; break;
        }
        if (!isFunction[y][x] && invert) modules[y][x] = !modules[y][x];
      }
    }
  }

  function penaltyScore(modules) {
    var size = modules.length;
    var result = 0;

    // Adjacent modules in rows/columns
    for (var y = 0; y < size; y++) {
      var colorR = false, runXR = 0;
      var colorC = false, runXC = 0;
      for (var x = 0; x < size; x++) {
        if (modules[y][x] === colorR) {
          runXR++;
          if (runXR === 5) result += 3;
          else if (runXR > 5) result++;
        } else { colorR = modules[y][x]; runXR = 1; }

        if (modules[x][y] === colorC) {
          runXC++;
          if (runXC === 5) result += 3;
          else if (runXC > 5) result++;
        } else { colorC = modules[x][y]; runXC = 1; }
      }
    }

    // 2x2 blocks of same color
    for (var y2 = 0; y2 < size - 1; y2++) {
      for (var x2 = 0; x2 < size - 1; x2++) {
        var c = modules[y2][x2];
        if (c === modules[y2][x2 + 1] && c === modules[y2 + 1][x2] && c === modules[y2 + 1][x2 + 1]) result += 3;
      }
    }

    // Finder-like patterns
    // (Simplified — skip for compactness; mild penalty)

    // Proportion of dark modules
    var dark = 0;
    for (var i = 0; i < size; i++) {
      for (var j = 0; j < size; j++) if (modules[i][j]) dark++;
    }
    var total = size * size;
    var k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * 10;
    return result;
  }

  // ---- Main entry ----

  function generate(text, ecLevel) {
    var ec = ecLevel || 'M';
    if (!ECC_CODEWORDS_PER_BLOCK[ec]) ec = 'M';
    var bytes = encodeByteSegment(String(text || ''));

    // Pick smallest version 1..10 that fits
    var version = 1;
    for (; version <= 10; version++) {
      var dataCapacityBits = getNumDataCodewords(version, ec) * 8;
      var modeBits = 4;
      var charCountBits = (version <= 9) ? 8 : 16;
      var totalBits = modeBits + charCountBits + bytes.length * 8;
      if (totalBits <= dataCapacityBits) break;
    }
    if (version > 10) throw new Error('Data too long for QR (max version 10 supported)');

    // Build bit stream
    var bb = [];
    appendBits(bb, 4, 4); // byte mode indicator
    appendBits(bb, bytes.length, version <= 9 ? 8 : 16);
    for (var i = 0; i < bytes.length; i++) appendBits(bb, bytes[i], 8);

    var dataCapacityBits2 = getNumDataCodewords(version, ec) * 8;
    appendBits(bb, 0, Math.min(4, dataCapacityBits2 - bb.length));
    while (bb.length % 8 !== 0) bb.push(0);
    for (var padByte = 0xEC; bb.length < dataCapacityBits2; padByte ^= 0xEC ^ 0x11) {
      appendBits(bb, padByte, 8);
    }

    // Pack bits to bytes
    var dataCodewords = new Array(bb.length / 8).fill(0);
    for (var k = 0; k < bb.length; k++) {
      dataCodewords[k >>> 3] |= bb[k] << (7 - (k & 7));
    }

    var allCodewords = buildAllCodewords(dataCodewords, version, ec);

    var size = version * 4 + 17;
    var modules = makeMatrix(size, false);
    var isFunction = makeMatrix(size, false);

    drawFunctionPatterns(modules, isFunction, version);
    drawCodewords(modules, isFunction, allCodewords);

    // Pick best mask
    var bestMask = 0;
    var bestPenalty = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      applyMask(modules, isFunction, mask);
      drawFormatBits(modules, isFunction, ec, mask);
      var p = penaltyScore(modules);
      if (p < bestPenalty) { bestPenalty = p; bestMask = mask; }
      applyMask(modules, isFunction, mask); // undo
    }
    applyMask(modules, isFunction, bestMask);
    drawFormatBits(modules, isFunction, ec, bestMask);

    // Convert booleans to 1/0
    var out = new Array(size);
    for (var r = 0; r < size; r++) {
      out[r] = new Array(size);
      for (var c = 0; c < size; c++) out[r][c] = modules[r][c] ? 1 : 0;
    }
    return { size: size, modules: out };
  }

  root.QRCodeGen = { generate: generate };
})(typeof globalThis !== 'undefined' ? globalThis : window);
