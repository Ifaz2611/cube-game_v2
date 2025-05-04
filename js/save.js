/*
 * File:    save.js
 * Saves game state with player information to file or locally.
 *
 * Author:  Karl Kangur <karl.kangur@gmail.com>
 * License: WTFPL 2.0 (http://en.wikipedia.org/wiki/WTFPL)
 * Updated by: Ifaz2611
*/

function Save(world, player) {
	this.world = world;
	this.player = player;

	this.getSavedWorlds();
}

// ####################################### LOCAL STORAGE HANDLING

Save.prototype.removeLocalSave = function () {
	const selectedKey = document.getElementById("load").value;
	if (selectedKey) {
		window.localStorage.removeItem(selectedKey);
		this.getSavedWorlds();
	}
};

Save.prototype.getSavedWorlds = function () {
	const options = [];

	for (const key in window.localStorage) {
		if (key.startsWith("world")) {
			const sizeKB = (window.localStorage[key].length / 1024) | 0;
			options.push(`<option value="${key}">${key} (${sizeKB}KB)</option>`);
		}
	}

	options.sort();
	document.getElementById("load").innerHTML = options.join("");
};

// ####################################### SAVE METHODS

Save.prototype.saveLocally = function () {
	try {
		const name = document.getElementById("saveas").value;
		window.localStorage.setItem(name, this.getSaveData());
	} catch (e) {
		if (e.code === 22 || e.name === 'QuotaExceededError') {
			alert("Could not save world: not enough space.");
		} else {
			alert("Could not save world. Error code: " + e.code);
		}
	}
	this.getSavedWorlds();
};

Save.prototype.saveToFile = function () {
	const dataStr = "data:text/octet-stream," + encodeURIComponent(this.getSaveData());
	document.location = dataStr;
};

Save.prototype.getSaveData = function () {
	const chunkX = Math.floor(this.player.position.x / 16);
	const chunkZ = Math.floor(this.player.position.z / 16);
	const saveNodes = [];

	for (const i in this.world.chunks) {
		const chunk = this.world.chunks[i];
		if (Math.abs(chunk.x - chunkX) <= 1 && Math.abs(chunk.z - chunkZ) <= 1) {
			for (const node of chunk.nodes) {
				saveNodes.push({
					x: node.x,
					y: node.y,
					z: node.z,
					t: node.type.id
				});
			}
		}
	}

	return JSON.stringify({
		player: {
			x: this.player.position.x.toFixed(2),
			y: this.player.position.y.toFixed(2),
			z: this.player.position.z.toFixed(2),
			rx: this.player.rotation.x.toFixed(2),
			ry: this.player.rotation.y.toFixed(2),
			rz: this.player.rotation.z.toFixed(2)
		},
		spawn: {
			x: this.world.spawn.x,
			y: this.world.spawn.y,
			z: this.world.spawn.z
		},
		seed: this.world.map.seed,
		nodes: saveNodes
	});
};

// ####################################### LOAD METHODS

Save.prototype.loadLocalSave = function () {
	const worldName = document.getElementById("load").value;
	if (worldName) {
		const data = window.localStorage.getItem(worldName);
		this.loadWorld(data);
	}
};

Save.prototype.loadFromFile = function (file) {
	const reader = new FileReader();

	reader.onload = (e) => {
		this.loadWorld(e.target.result);
	};

	reader.onerror = () => {
		const error = reader.error;
		if (error && (error.code === 2 || error.name === 'NotReadableError')) {
			alert("You cannot load files when running locally due to security reasons.");
		} else {
			alert("Could not load file. Error code: " + error?.code);
		}
	};

	reader.readAsText(file);
};

Save.prototype.loadWorld = function (worldData) {
	const data = JSON.parse(worldData);

	this.world.chunks = {};
	this.world.seed = parseInt(data.seed);

	for (const node of data.nodes) {
		this.world.addNode(
			parseInt(node.x),
			parseInt(node.y),
			parseInt(node.z),
			nodeType.getTypeName(parseInt(node.t))
		);
	}

	this.player.position = {
		x: parseFloat(data.player.x),
		y: parseFloat(data.player.y),
		z: parseFloat(data.player.z)
	};

	this.player.rotation = {
		x: parseFloat(data.player.rx),
		y: parseFloat(data.player.ry),
		z: parseFloat(data.player.rz)
	};
};
