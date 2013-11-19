var Fs = require("fs");

var builders = {};
var buildersPath = __dirname + "/builders/";
Fs.readdirSync(buildersPath).forEach(function (name) {
    var json = JSON.parse(Fs.readFileSync(buildersPath + name));
    builders[json.caption || name] = json;
});

module.exports = builders;
