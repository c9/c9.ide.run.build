/**
 * Builds code
 *
 * @copyright 2010, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */
define(function(require, module, exports) {
    main.consumes = ["Plugin", "settings", "fs", "c9", "preferences", "run"];
    main.provides = ["build"];
    return main;

    function main(options, imports, register) {
        var Plugin      = imports.Plugin;
        var settings    = imports.settings;
        var prefs       = imports.preferences;
        var run         = imports.run;
        var fs          = imports.fs;
        var c9          = imports.c9;
        
        /***** Initialization *****/
        
        var plugin  = new Plugin("Ajax.org", main.consumes);
        var emit    = plugin.getEmitter();
        
        var builders   = options.builders;
        var processes  = [];
        var base       = options.base;
        
        var loaded = false;
        function load(){
            if (loaded) return false;
            loaded = true;
            
            // Settings
            settings.on("read", function(e){
                // Defaults
                settings.setDefaults("project/build", [
                    ["path", "~/.c9/builders"]
                ]);
            }, plugin);
            
            settings.on("write", function(e){
                
            }, plugin);
            
            // Preferences
            prefs.add({
                "Project" : {
                    "Build" : {
                        "Builder Path in Workspace" : {
                           type : "textbox",
                           path : "project/build/@path",
                           position : 1000
                        }
                    }
                }
            }, plugin);

            // Check after state.change
            c9.on("stateChange", function(e){
                
            }, plugin);
            
            // @todo Could consider adding a watcher to ~/.c9/runners
            
            listBuilders(function(err, files){
                files.forEach(function(file){
                    if (!builders[file]) {
                        getBuilder(file, false, function(err, builder){
                            builders[file] = builder;
                        });
                    }
                })
            })
        }
        
        /***** Methods *****/
        
        function listBuilders(callback){
            var builders = Object.keys(options.builders || {});
            fs.readdir(settings.get("project/build/@path"), function(err, files){
//                if (err && err.code == "ENOENT")
//                    return callback(err);
                
                if (files) {
                    files.forEach(function(file){
                        builders.push(file.name);
                    });
                }
                
                callback(null, builders);
            });
        }
        
        function detectBuilder(options, callback){
            var ext = fs.getExtension(options.path);
            
            listBuilders(function(err, names){
                if (err) return callback(err);
                
                var count = 0;
                names.forEach(function(name){
                    if (!builders[name]) {
                        count++;
                        getBuilder(name, false, function(){
                            if (--count === 0)
                                done();
                        });
                    }
                })
                if (count === 0) done();
            });
            
            function done(){
                for (var name in builders) {
                    var builder = builders[name];
                    if (builder.selector == "source." + ext)
                        return callback(null, builder);
                }
                
                var err = new Error("Could not find Builder");
                err.code = "EBUILDERNOTFOUND";
                callback(err);
            }
        }
        
        function getBuilder(name, refresh, callback){
            if (builders[name] && !refresh)
                callback(null, builders[name]);
            else {
                fs.readFile(settings.get("project/build/@path") 
                  + "/" + name, "utf8", function(err, data){
                    if (err)
                        return callback(err);
                    
                    var builder;
                    try{ builder = JSON.parse(data); }
                    catch(e){ return callback(e); }
                    
                    builders[name] = builder;
                    callback(null, builder);
                })
            }
        }
        
        function build(builder, options, name, callback){
            options.builder = true;
            
            if (builder == "auto") { 
                return detectBuilder(options, function(err, detected){
                    if (err) return callback(err);
                    
                    build(detected, options, name, callback);
                });
            }
            
            var proc = run.run(builder, options, name, callback);
            processes.push(proc);
            
            var event = { process: proc };
            
            proc.on("starting", function(){ emit("starting", event); })
            proc.on("started", function(){ emit("started", event); })
            proc.on("stopping", function(){ emit("stopping", event); })
            proc.on("stopped", function(){ 
                emit("stopped", event); 
                processes.remove(proc);
            });
            
            return proc;
        }
        
//        function stopAll(){
//            processes.forEach(function(proc){
//                proc.stop();
//            })
//        }
        
        /***** Lifecycle *****/
        
        plugin.on("load", function(){
            load();
        });
        plugin.on("enable", function(){
            
        });
        plugin.on("disable", function(){
            
        });
        plugin.on("unload", function(){
            loaded = false;
        });
        
        /***** Register and define API *****/
        
        /**
         * Runs arbitrary programs and code within Cloud9 IDE. This plugin
         * depends on the `run` plugin. 
         * 
         * @property processes {Array} List of builder processes
         * 
         * @property STOPPING {-1} to be tested against the `running` property. Indicates the process is being killed.
         * @property STOPPED  {0} to be tested against the `running` property. Indicates the process is not running.
         * @property STARTING {1} to be tested against the `running` property. Indicates the process is getting started.
         * @property STARTED  {2} to be tested against the `running` property. Indicates the process is running.
         * 
         * @event stopping Fires when the process is going to be killed
         * @param {Object} e
         *   process {Process} the process that is stopping
         * @event stopped Fires when the process stopped running
         * @param {Object} e
         *   process {Process} the process that is stopped
         * @event starting Fires when the process is being started
         * @param {Object} e
         *   process {Process} the process that is starting
         * @event started Fires when the process is started. This event also fires during startup if there's a PID file present
         * @param {Object} e
         *   process {Process} the process that is stopped
         */
        plugin.freezePublicAPI({
            STOPPING : run.STOPPING,
            STOPPED  : run.STOPPED,
            STARTING : run.STARTING,
            STARTED  : run.STARTED,
            
            get processes(){ return processes; },
            get builders(){ return builders; },
            get base(){ return base; },
            
            /**
             * Retrieves an array of names of builders available to the system.
             * A builder is a JSON file that describes how a certain file can
             * be executed. The JSON file format is based on and compatible with
             * the sublime build scripts. Besides the build in builders, the
             * user can store builders in ~/.c9/builders. This list will contain
             * both the user's builders as well as the build-in builders.
             * @param callback(err, builders) {Function} called when the builders are retrieved
             */
            listBuilders : listBuilders,
            
            /**
             * Retrieves an individual builder's JSON object based on it's name.
             * The names of available builders can be retrieved using `listBuilders`.
             * @param callback(err, builder) {Function} called when the builder is retrieved
             */
            getBuilder : getBuilder,
            
            /**
             * Stop all running processes
             */
            //stopAll : stopAll,
            
            /**
             * Builds a file. See `run.run()` for the full documentation
             * @param builder {Object, "auto"} Object describing how to build a process. 
             * @param {Object} 
             options * @param {Object} e
             *   path  {String} the path to the file to execute
             *   cwd   {String} the current working directory
             *   debug {Boolean} whether to start the process in debug mode
             * @param {String} name   the unique name of the output buffer. Defaults to "output". 
             * @param {Function} callback called when the process is started
             * @returns process {Process} the process object
             */
            build : build
        });
        
        register(null, {
            build : plugin
        });
    }
});