const mixbox = require('mixbox');
console.log("R+G: ", mixbox.lerp([255, 0, 0], [0, 255, 0], 0.5));
console.log("B+Y: ", mixbox.lerp([0, 0, 255], [255, 255, 0], 0.5));
console.log("R+Y: ", mixbox.lerp([255, 0, 0], [255, 255, 0], 0.5));
console.log("R+B+W: ", mixbox.lerp(mixbox.lerp([255, 0, 0], [0, 0, 255], 0.5), [255, 255, 255], 0.5));
