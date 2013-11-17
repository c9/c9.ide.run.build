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
                        position : 400,
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
                    if (run.matchSelector(builder.selector, options.path))
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
         * Builds arbitrary code from within Cloud9 IDE based on a builder. 
         * 
         * *NB.: The build plugin works almost identical to the run plugin. The
         * builder format is a subset of the runner format. The major difference
         * is that builders are used to build code into executables or 
         * deployables and that the runner is used to run executables.*
         * 
         * Example:
         * 
         *     build.getBuilder("coffee", false, function(err, builder){
         *         if (err) throw err.message;
         *         
         *         var process = build.build(builder, {
         *             path: "/helloworld.coffee"
         *         }, function(err, pid){
         *             if (err) throw err.message;
         * 
         *             console.log("The PID is ", pid);
         *         });
         *     });
         * 
         * You can also ask for auto-detection of the builder based on the file
         * extension:
         * 
         *     var process = build.build("auto", {
         *         path: "/helloworld.coffee"
         *     }, function(err, pid){
         *         if (err) throw err.message;
         *     
         *         console.log("The PID is ", pid);
         *     });
         * 
         * A builder is a simple struct that describes how to build a 
         * certain subset of files. For instance a builder describing how to run 
         * Coffeescript files looks like this:
         * 
         *     {
         *         "caption" : "Coffee",
         *         "cmd": [coffee, "-c", "$file"],
         *         "selector": "source.coffee"
         *     }
         * 
         * The concept of builders is based on the
         * [Sublime Text(tm) Build Systems](http://docs.sublimetext.info/en/sublime-text-3/file_processing/build_systems.html),
         * and is compatible with that format. There are a several
         * built-in builders, and external plugins can add new builders as well.
         * Users can also add builders to their .c9/builders directory in
         * the workspace. We recommend users to commit these builders to their
         * repository.
         * 
         * The {@link run run plugin} also uses a compatible
         * format for the cloud9 runners.
         * 
         * It is possible to combine builders and runners, therefore it is
         * often not needed to describe the build and run step in the same
         * definition.
         * 
         * A process is always started in a [TMUX](http://en.wikipedia.org/wiki/Tmux) 
         * session. TMUX is a PTY multi-plexer which has several advantages; 
         * multiple clients can connect to the same session and the sessions are 
         * kept even if no user is connected. 
         * 
         * You can connect an {@link output} pane to the started process to
         * see the output of your running process. The name passed to
         * {@link build#build} should be the same as the name of the output pane
         * you open:
         * 
         *     tabManager.open({
         *         editorType : "output", 
         *         active     : true,
         *         document   : {
         *             title  : "My Process Name",
         *             output : {
         *                 id : "name_of_process"
         *             }
         *         }
         *     }, function(){});
         * 
         * Note that by default the process name is "output" and is shown in the
         * default output panel (available via the View menu).
         * 
         * @singleton
         */
        plugin.freezePublicAPI({
            /**
             * Indicates the process is being killed. To be tested against 
             * the `running` property.
             * @property {-1} STOPPING
             */
            STOPPING : run.STOPPING,
            /**
             * Indicates the process is not running. To be tested against 
             * the `running` property.
             * @property {0}  STOPPED 
             */
            STOPPED  : run.STOPPED,
            /**
             * Indicates the process is getting started. To be tested against 
             * the `running` property.
             * @property {1}  STARTING
             */
            STARTING : run.STARTING,
            /**
             * Indicates the process is running. To be tested against 
             * the `running` property.
             * @property {2}  STARTED 
             */
            STARTED  : run.STARTED,
            
            /**
             * @property {run.Process[]}  processes  List of running processes
             */
            get processes(){ return processes; },
            /**
             * @property {Object[]}  builders  List of available builders
             */
            get builders(){ return builders; },
            /**
             * @ignore
             */
            get base(){ return base; },
            
            _events : [
                /**
                 * Fires when the process is going to be killed
                 * @event stopping
                 * @param {Object} e
                 * @param {run.Process} e.process the process that is stopping
                 */
                "stopping",
                /**
                 * Fires when the process stopped running
                 * @event stopped 
                 * @param {Object} e
                 * @param {run.Process} e.process the process that is stopped
                 */
                "stopped",
                /**
                 * Fires when the process is being started
                 * @event starting 
                 * @param {Object} e
                 * @param {run.Process} e.process the process that is starting
                 */
                "starting",
                /**
                 * Fires when the process is started. This event also fires 
                 * during startup if there's a PID file present.
                 * @event started 
                 * @param {Object} e
                 * @param {run.Process} e.process the process that is started
                 */
                "started"
            ],
            
            /**
             * Retrieves an array of names of builders available to the system.
             * A builder is a JSON file that describes how a certain file can
             * be executed. The JSON file format is based on and compatible with
             * the sublime build scripts. Besides the build in builders, the
             * user can store builders in ~/.c9/builders. This list will contain
             * both the user's builders as well as the build-in builders.
             * @param {Function} callback           Called when the builders are retrieved
             * @param {Error}    callback.err       The error object if an error occurred.
             * @param {String[]} callback.builders  A list of names of builders.
             */
            listBuilders : listBuilders,
            
            /**
             * Retrieves an individual builder's JSON object based on it's name.
             * The names of available builders can be retrieved using `listBuilders`.
             * @param {Function} callback         Called when the runner is retrieved
             * @param {Function} callback.err     The error object if an error occurred.
             * @param {Function} callback.runner  A builder object. See {@link run#run} for more information.
             */
            getBuilder : getBuilder,
            
            /**
             * Builds a file. See `run.run()` for the full documentation
             * @param {Object/"auto"} builder   Object describing how to build a process. 
             * @param {Object}        options 
             * @param {String}        options.path        The path to the file to build
             * @param {String}        [options.cwd]       The current working directory
             * @param {Boolean}       [options.debug]     Specifies whether to start the process in debug mode
             * @param {String}        [name]              The unique name of the output buffer. Defaults to "output". 
             * @param {Function}      callback            Called when the process is started
             * @param {Error}         callback.err        The error object if an error occurred.
             * @returns {run.Process} the process object
             */
            build : build
        });
        
        register(null, {
            build : plugin
        });
    }
});