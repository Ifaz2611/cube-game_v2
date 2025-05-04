const SQUARIFIC = { framework: {} };

SQUARIFIC.framework.TouchControl = function (elem, settings = {}) {
	"use strict";

	// Default settings
	settings.pretendArrowKeys = true;
	settings.mindistance = isNaN(settings.mindistance) ? 20 : settings.mindistance;
	settings.middleLeft = isNaN(settings.middleLeft) ? 0 : settings.middleLeft;
	settings.middleTop = isNaN(settings.middleTop) ? 0 : settings.middleTop;

	if (!elem) throw "TouchControl Error: No element provided.";

	const self = this;
	const callbacks = [];
	const multiple = 45;
	let originalStyle, originalX = 0, originalY = 0;
	let fakeKeysPressed = [];

	// Key map by angle
	const angleKeys = [
		{ angle: 0, keyCodes: [39] },       // Right
		{ angle: 45, keyCodes: [39, 40] },  // Down-right
		{ angle: 90, keyCodes: [40] },      // Down
		{ angle: 135, keyCodes: [40, 37] }, // Down-left
		{ angle: 180, keyCodes: [37] },     // Left
		{ angle: -180, keyCodes: [37] },    // Left
		{ angle: -135, keyCodes: [37, 38] },// Up-left
		{ angle: -90, keyCodes: [38] },     // Up
		{ angle: -45, keyCodes: [38, 39] }  // Up-right
	];

	// Public: Register a callback
	this.on = function (name, cb) {
		const id = callbacks.length ? callbacks[callbacks.length - 1].id + 1 : 0;
		callbacks.push({ id, name, cb });
		return id;
	};

	// Public: Remove a callback by ID
	this.removeOn = function (id) {
		const index = callbacks.findIndex(c => c.id === id);
		if (index !== -1) {
			callbacks.splice(index, 1);
			return true;
		}
		return false;
	};

	// Internal: Trigger callbacks
	this.cb = function (name, arg) {
		for (const cb of callbacks) {
			if (cb.name === name && typeof cb.cb === "function") {
				cb.cb(arg);
			}
		}
	};

	// Internal: Check if value exists in array
	this.inArray = function (val, arr) {
		return arr && arr.includes(val);
	};

	// Internal: Remove fake keys not currently active
	this.removeNonFakedKeys = function (activeKeys = []) {
		for (const key of fakeKeysPressed) {
			if (!activeKeys.includes(key)) {
				this.cb("pretendKeyup", { keyCode: key });
			}
		}
		fakeKeysPressed = activeKeys.slice();
	};

	// Internal: Calculate angle to nearest 45°
	const getRoundedAngle = (dx, dy) => {
		return multiple * Math.round((Math.atan2(dy, dx) * 180 / Math.PI) / multiple);
	};

	// Touch start
	this.handleTouchStart = (event) => {
		if (event.changedTouches[0].target === elem) {
			const touch = event.changedTouches[0];
			originalStyle = {
				position: elem.style.position,
				top: elem.style.top,
				left: elem.style.left
			};
			originalX = touch.clientX;
			originalY = touch.clientY;
			elem.style.position = "fixed";
			elem.style.left = `${touch.clientX - settings.middleLeft}px`;
			elem.style.top = `${touch.clientY - settings.middleTop}px`;
			event.preventDefault();
		}
	};

	// Touch end
	this.handleTouchStop = (event) => {
		if (event.changedTouches[0].target === elem) {
			Object.assign(elem.style, originalStyle);
			this.removeNonFakedKeys([]);
			event.preventDefault();
		}
	};

	// Touch move
	this.handleTouchMove = (event) => {
		if (event.changedTouches[0].target === elem) {
			const touch = event.changedTouches[0];
			const dx = touch.clientX - originalX;
			const dy = touch.clientY - originalY;
			const distance = Math.sqrt(dx * dx + dy * dy);

			elem.style.left = `${touch.clientX - settings.middleLeft}px`;
			elem.style.top = `${touch.clientY - settings.middleTop}px`;
			event.preventDefault();

			if (settings.pretendArrowKeys) {
				if (distance < settings.mindistance) {
					this.removeNonFakedKeys([]);
					return;
				}

				const angle = getRoundedAngle(dx, dy);
				const keys = [];

				for (const mapping of angleKeys) {
					if (mapping.angle === angle) {
						keys.push(...mapping.keyCodes);
					}
				}

				// Fire keydown events
				for (const key of keys) {
					if (!this.inArray(key, fakeKeysPressed)) {
						this.cb("pretendKeydown", { keyCode: key });
					}
				}

				this.removeNonFakedKeys(keys);
			}
		}
	};

	// Register event listeners
	elem.addEventListener("touchstart", this.handleTouchStart);
	elem.addEventListener("touchend", this.handleTouchStop);
	elem.addEventListener("touchmove", this.handleTouchMove);
};
