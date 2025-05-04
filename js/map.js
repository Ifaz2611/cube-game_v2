/*
 * File:    map.js
 * Description: Map class that generates a continuous heightmap based on a seed.
 * Original Author: Karl Kangur <karl.kangur@gmail.com>
 * License: WTFPL 2.0 (http://en.wikipedia.org/wiki/WTFPL)
 * Updated by: Ifaz2611
 */

class Map {
	constructor(seed) {
		this.seed = seed;
		this.cache = {};
	}

	// Public: Get absolute height (scaled and offset)
	getAbsoluteHeight(x, z) {
		return Math.floor(10 * this.getHeight(x, z) + 5);
	}

	// Public: Get normalized height value between 0 and 1
	getHeight(x, z) {
		const chunkX = Math.floor(x / 16);
		const chunkZ = Math.floor(z / 16);

		const localX = ((x % 16) + 16) % 16;
		const localZ = ((z % 16) + 16) % 16;

		const chunkKey = `${chunkX}_${chunkZ}`;

		// Return from cache if exists
		if (this.cache[chunkKey]) {
			return this.cache[chunkKey][localX][localZ];
		}

		// Generate new chunk
		const chunk = Array.from({ length: 16 }, () => Array(16).fill(0));
		const corners = this.getCorners(chunkX, chunkZ);

		for (let x = 0; x < 16; x++) {
			const a = this.interpolate(corners[0], corners[1], x / 16);
			const b = this.interpolate(corners[2], corners[3], x / 16);
			for (let z = 0; z < 16; z++) {
				chunk[x][z] = this.interpolate(a, b, z / 16);
			}
		}

		this.cache[chunkKey] = chunk;
		return chunk[localX][localZ];
	}

	// Internal: Get noise values for 4 corners of a chunk
	getCorners(chunkX, chunkZ) {
		const x0 = chunkX * 16;
		const z0 = chunkZ * 16;
		return [
			this.noise(x0, z0),
			this.noise(x0 + 16, z0),
			this.noise(x0, z0 + 16),
			this.noise(x0 + 16, z0 + 16),
		];
	}

	// Internal: Generate pseudorandom value between 0 and 1
	noise(x, y) {
		const k = x + y * this.seed;
		let n = (k << 13) ^ k;
		return ((n * (n * n * 60493 + 19990303) + 1376312589) & 0x7fffffff) / 2147483648;
	}

	// Internal: Cosine interpolation between two values
	interpolate(a, b, t) {
		const f = (1.0 - Math.cos(t * Math.PI)) * 0.5;
		return a * (1.0 - f) + b * f;
	}
}
