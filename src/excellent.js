/**
 * @author Vitaly Tomilov
 */
(function () {
    'use strict';

    /**
     * Registered app controllers.
     *
     * It is a controller name-to-function map for the app's local controllers.
     */
    var ctrlRegistered = {};

    /**
     * All live controllers (initialized, but not destroyed), with each property -
     * controller name set to an array of controller objects.
     *
     * @type {Object.<string, EController[]>}
     */
    var ctrlLive = {};

    /**
     * Global name-to-function cache for all controllers.
     */
    var ctrlCache = {};

    /**
     * All registered modules.
     */
    var modules = {};

    /**
     * All elements with controllers, currently in the DOM.
     */
    var elements = [];

    /**
     * Library's root object.
     *
     * @type {ERoot}
     */
    var root = new ERoot();

    /**
     * Helps observing when elements are removed.
     *
     * @type {DestroyObserver}
     */
    var observer = new DestroyObserver();

    document.addEventListener('DOMContentLoaded', function () {
        bindElement(null, true);
        if (typeof root.onInit === 'function') {
            root.onInit();
        }
    });

    function checkEntity(name, cb, entity) {
        name = typeof name === 'string' ? name : '';
        if (!validJsVariable(name)) {
            throw new TypeError('Invalid ' + entity + ' name ' + jStr(name) + ' specified.');
        }
        if (typeof cb !== 'function') {
            throw new TypeError('Initialization function for ' + entity + ' ' + jStr(name) + ' is missing.');
        }
    }

    /**
     * Validates controller name, optionally trimmed.
     *
     * @param {string} cn
     * Controller name.
     *
     * @param {boolean} [t]
     * Trims the name before validation.
     *
     * @returns {string|undefined}
     * Valid controller name, or nothing.
     */
    function validCN(cn, t) {
        if (typeof cn === 'string') {
            cn = t ? trim(cn) : cn;
            var m = cn.match(/^[a-z$_][$\w]*(\.[a-z$_][$\w]*)*$/i);
            if (m && m[0] === cn) {
                return cn;
            }
        }
    }

    /**
     * Validates a string to be a proper JavaScript open name.
     *
     * @param {string} name
     * @returns {boolean}
     */
    function validJsVariable(name) {
        var m = name.match(/[a-z$_][a-z$_0-9]*/i);
        return m && m[0] === name;
    }

    function jStr(value) {
        var t = typeof value;
        if (t === 'undefined' || t === 'boolean' || t === 'number' || value === null) {
            return '<' + value + '>';
        }
        if (t === 'function') {
            return '<' + value.toString() + '>';
        }
        return JSON.stringify(value);
    }

    /**
     * Searches for all elements that match selectors, and optionally - within a parent node.
     *
     * @param {string} selectors
     * Standard selectors.
     *
     * @param {Element} [node]
     * Parent node to search for children.
     *
     * @returns {Element[] | ControlledElement[]}
     */
    function findAll(selectors, node) {
        var f = (node || document).querySelectorAll(selectors);
        var l = f.length, arr = new Array(l);
        while (l--) {
            arr[l] = f[l];
        }
        return arr;
    }

    /**
     * Gets the primary attribute's value, if the attribute exists,
     * or else it gets the secondary attribute's value.
     *
     * @param e
     * Element to get the value from.
     *
     * @param primary
     * Primary attribute name.
     *
     * @param secondary
     * Secondary attribute name.
     *
     * @returns {string}
     * The attribute's value.
     */
    function getAttribute(e, primary, secondary) {
        if (e.hasAttribute(primary)) {
            return e.getAttribute(primary);
        }
        return e.getAttribute(secondary);
    }

    /**
     * Trims a string, by removing all trailing spaces, tabs and line breaks.
     *
     * @param {string} txt
     *
     * @returns {string}
     */
    function trim(txt) {
        return txt.replace(/^[\s]*|[\s]*$/g, '');
    }

    /**
     * Creates a read-only enumerable property on an object.
     *
     * @param {object} target
     * Target object.
     *
     * @param {string} prop
     * Property name.
     *
     * @param {} value
     * Property value.
     */
    function readOnlyProp(target, prop, value) {
        Object.defineProperty(target, prop, {value: value, enumerable: true});
    }

    /**
     * Smart asynchronous bindings management, to help
     * executing only the necessary minimum of bindings.
     *
     * @type {{nodes: Array, cb: Array}}
     */
    var bindings = {
        nodes: [], // local elements
        cb: [], // all callbacks
        busy: false
    };

    /**
     * General binding processor.
     *
     * It implements the logic of binding that's reduced to the absolute minimum of requests.
     *
     * @param {Element} [node]
     * Element to start processing from.
     *
     * @param {boolean|function} process
     * Determines how to process the binding:
     * - _any falsy value (default):_ the binding will be done asynchronously;
     * - _a function:_ binding is asynchronous, calling the function when finished;
     * - _any truthy value, except a function type:_ forces synchronous binding.
     */
    function bindElement(node, process) {
        var cb = typeof process === 'function' && process;
        if (process && !cb) {
            // synchronous binding;
            if (bindings.busy) {
                if (node) {
                    // Cancel asynchronous binding on the same node:
                    var idx = bindings.nodes.indexOf(node);
                    if (idx >= 0) {
                        bindings.nodes.splice(idx, 1);
                    }
                } else {
                    // A global synchronous binding cancels all local bindings:
                    bindings.busy = false;
                }
            }
            bind(node);
        } else {
            // asynchronous binding;
            if (node) {
                // local binding, append the request, if unique:
                if (bindings.nodes.indexOf(node) === -1) {
                    bindings.nodes.push(node);
                }
            } else {
                // global binding, cancels local bindings:
                bindings.nodes.length = 0;
            }
            if (cb) {
                // callback notifications:
                bindings.cb.push(cb);
            }
            if (bindings.busy) {
                return;
            }
            bindings.busy = true;
            setTimeout(function () {
                var glob = !bindings.nodes.length;
                var cbs = bindings.cb.slice();
                bindings.cb.length = 0;
                if (bindings.busy) {
                    bindings.busy = false;
                    if (glob) {
                        bind();
                    } else {
                        var nodes = bindings.nodes.slice();
                        bindings.nodes.length = 0;
                        nodes.forEach(bind);
                    }
                }
                cbs.forEach(function (f) {
                    f();
                });
            });
        }
    }

    /**
     * Binds to controllers all elements that are not yet bound.
     *
     * @param {Element} [node]
     * Top-level node element to start searching from. When not specified,
     * the search is done for the entire document.
     */
    function bind(node) {
        var allCtrl = [], els = [];
        findAll('[data-e-bind],[e-bind]', node)
            .forEach(function (e) {
                if (!e.controllers) {
                    var namesMap = {}, eCtrl;
                    getAttribute(e, 'data-e-bind', 'e-bind')
                        .split(',')
                        .forEach(function (name) {
                            name = trim(name);
                            if (name) {
                                if (!validCN(name)) {
                                    throw new Error('Invalid controller name ' + jStr(name) + '.');
                                }
                                if (name in namesMap) {
                                    throw new Error('Duplicate controller name ' + jStr(name) + ' not allowed.');
                                }
                                namesMap[name] = true;
                                var c = new EController(name, e);
                                getCtrlFunc(name).call(c, c);
                                eCtrl = eCtrl || {};
                                readOnlyProp(eCtrl, name, c);
                                allCtrl.push(c);
                                ctrlLive[name] = ctrlLive[name] || [];
                                ctrlLive[name].push(c);
                            }
                        });
                    if (eCtrl) {
                        readOnlyProp(e, 'controllers', eCtrl);
                        elements.push(e);
                        els.push(e);
                    }
                }
            });
        els.forEach(observer.watch);
        allCtrl.forEach(function (c) {
            if (typeof c.onInit === 'function') {
                c.onInit();
            }
        });
    }

    /**
     * @constructor
     * @private
     * @description
     * Helps watching node elements removal from DOM, in order to provide {@link EController.event:onDestroy onDestroy}
     * notification for all corresponding controllers.
     *
     * For IE9/10 that do not support `MutationObserver`, it executes manual check every 500ms.
     */
    function DestroyObserver() {
        var mo;
        // MutationObserver does not exist in JEST:
        // istanbul ignore else
        if (typeof MutationObserver === 'undefined') {
            setInterval(manualCheck, 500); // This is a work-around for IE9 and IE10
        } else {
            mo = new MutationObserver(mutantCB);
        }

        /**
         * @member DestroyObserver.watch
         * @description
         * Initiates watching the element.
         *
         * @param {Element} e
         * Element to be watched.
         */
        this.watch = function (e) {
            // MutationObserver does not exist in JEST:
            // istanbul ignore if
            if (mo) {
                mo.observe(e, {childList: true});
            }
        };

        // MutationObserver does not exist in JEST:
        // istanbul ignore next
        function mutantCB(mutations) {
            mutations.forEach(function (m) {
                for (var i = 0; i < m.removedNodes.length; i++) {
                    var e = m.removedNodes[i];
                    if (e.controllers) {
                        var idx = elements.indexOf(e);
                        if (idx >= 0) {
                            elements.splice(idx, 1);
                            notify(e);
                        }
                        removeControllers(e);
                    }
                }
            });
        }

        /**
         * Removes all controllers from ctrlLive, as per the element.
         *
         * @param {ControlledElement} e
         */
        function removeControllers(e) {
            for (var a in e.controllers) {
                var c = ctrlLive[a];
                if (c) {
                    // This verification, for a NULL-array is a bit stupid,
                    // as it is logically impossible, but during synthetic
                    // tests in JEST it just keeps happening anyway.
                    var i = c.indexOf(e.controllers[a]);
                    ctrlLive[a].splice(i, 1);
                    if (!ctrlLive[a].length) {
                        delete ctrlLive[a];
                    }
                }
            }
        }

        /**
         * Manual check for controlled elements that have been deleted from DOM.
         */
        function manualCheck() {
            var i = elements.length;
            if (i) {
                var ce = findAll('[data-e-bind],[e-bind]'); // all controlled elements;
                while (i--) {
                    var e = elements[i];
                    if (ce.indexOf(e) === -1) {
                        elements.splice(i, 1);
                        notify(e);
                        removeControllers(e);
                    }
                }
            }
        }

        /**
         * Sends `onDestroy` notification into all controllers of an element.
         *
         * @param {ControlledElement} e
         */
        function notify(e) {
            for (var i in e.controllers) {
                var c = e.controllers[i];
                if (typeof c.onDestroy === 'function') {
                    c.onDestroy();
                }
            }
        }

    }

    /**
     * @interface ControlledElement
     * @extends Element
     * @description
     * Represents a standard DOM element, extended with read-only property `controllers`.
     *
     * This type is provided by the library automatically, after binding the element to controllers.
     *
     * @see
     * {@link ERoot#bind ERoot.bind},
     * {@link EController#bind EController.bind}
     */

    /**
     * @member {Object.<string, EController>} ControlledElement#controllers
     * @readonly
     * @description
     * An object - map, with each property (controller name) of type {@link EController}.
     * And each property in the object is read-only.
     *
     * This property is available only after the controller has been initialized.
     *
     * For example, if you have a binding like this:
     *
     * ```html
     * <div e-bind="homeCtrl, view.main"></div>
     * ```
     *
     * Then you can access those controllers like this:
     *
     * ```js
     * app.addController('homeCtrl', function(ctrl) {
     *
     *     // During the controller's construction,
     *     // this.node.controllers is undefined.
     *
     *     this.onInit = function() {
     *         var ctrl1 = this.node.controllers.homeCtrl;
     *         // ctrl1 = ctrl = this
     *
     *         var ctrl2 = this.node.controllers['view.main'];
     *     };
     * });
     * ```
     */

    /**
     * Searches for a controller function, based on the controller's full name.
     * For that it uses the cache of names, plus modules.
     *
     * @param {string} name
     *
     * @param {boolean} [noError=false]
     * Tells it not to throw on errors, and rather return null.
     *
     * @returns {function|undefined}
     * Either controller function or throws. But if noError is true,
     * and no controller found, it returns `undefined`.
     *
     */
    function getCtrlFunc(name, noError) {
        if (name in ctrlCache) {
            return ctrlCache[name]; // use the cache
        }
        if (name.indexOf('.') === -1) {
            // it is an in-app controller;
            var f = ctrlRegistered[name]; // the function
            if (f) {
                ctrlCache[name] = f; // updating cache
                return f;
            }
        } else {
            // the controller is from a module
            var names = name.split('.');
            var moduleName = names[0];
            if (!(moduleName in modules)) {
                if (noError) {
                    return;
                }
                throw new Error('Module ' + jStr(moduleName) + ' not found.');
            }
            var obj = modules[moduleName];
            for (var i = 1; i < names.length; i++) {
                var n = names[i];
                if (n in obj) {
                    obj = obj[n];
                } else {
                    obj = null;
                    break;
                }
            }
            if (typeof obj === 'function') {
                ctrlCache[name] = obj;
                return obj;
            }
        }

        if (!noError) {
            throw new Error('Controller ' + jStr(name) + ' not found.');
        }
    }

    /**
     * Parses a controller name, allowing for trailing spaces.
     *
     * @param {string} cn
     * Controller name.
     *
     * @returns {string}
     * Validated controller name (without trailing spaces).
     */
    function parseControllerName(cn) {
        var name = validCN(cn, true);
        if (!name) {
            throw new TypeError('Invalid controller name ' + jStr(cn) + ' specified.');
        }
        return name;
    }

    /**
     * @interface ERoot
     * @description
     * Root interface of the library, available via global variable `excellent`.
     *
     * You can make this interface also available via an alias name that can be set via
     * attribute `e-root` or `data-e-root` on the `HTML` element:
     *
     * ```html
     * <HTML e-root="app">
     * ```
     *
     * @see
     * {@link ERoot#services services},
     * {@link ERoot#version version},
     * {@link ERoot#addController addController},
     * {@link ERoot#addModule addModule},
     * {@link ERoot#addService addService},
     * {@link ERoot#bind bind},
     * {@link ERoot#find find},
     * {@link ERoot#findOne findOne},
     * {@link ERoot.event:onInit onInit}
     */
    function ERoot() {

        /**
         * @member ERoot#version
         * @type {string}
         * @readonly
         * @description
         * Library version, automatically injected during the build/compression process,
         * and so available only with the compressed version of the library.
         */
        readOnlyProp(this, 'version', '<version>');

        /**
         * @member ERoot#services
         * @type {object}
         * @readonly
         * @description
         * Namespace of all registered and initialized services.
         *
         * @see {@link ERoot#addService addService}
         *
         */
        readOnlyProp(this, 'services', {});

        /**
         * @method ERoot#addController
         * @description
         * Adds/Registers a new controller.
         *
         * If controller with such name already exists, then the method will do the following:
         *
         *  - throw an error, if the function is different
         *  - nothing, if the function is the same
         *
         * In order to avoid naming conflicts, reusable controllers should reside inside modules.
         *
         * @param {string} name
         * Controller name.
         *
         * @param {function} cb
         * Controller function.
         */
        this.addController = function (name, cb) {
            checkEntity(name, cb, 'controller');
            if (name in ctrlRegistered) {
                // controller name has been registered before
                if (ctrlRegistered[name] === cb) {
                    // it is the same controller, so we can just ignore it;
                    return;
                }
                throw new Error('Controller with name ' + jStr(name) + ' already exists.');
            }
            ctrlRegistered[name] = cb;
        };

        /**
         * @method ERoot#addService
         * @description
         * Adds and initializes a new service.
         *
         * If the service with such name already exists, the method will do nothing,
         * because it cannot determine whether the actual service behind the name is the same,
         * while services need to be fully reusable, even in dynamically loaded pages.
         *
         * Every added service becomes accessible by its name, from property {@link ERoot#services services}.
         *
         * @param {string} name
         * Service name.
         *
         * @param {function} cb
         * Service initialization function.
         */
        this.addService = function (name, cb) {
            checkEntity(name, cb, 'service');
            if (!(name in root.services)) {
                var s = {}; // service's scope
                readOnlyProp(root.services, name, s);
                cb.call(s, s);
            }
        };

        /**
         * @method ERoot#addModule
         * @description
         * Adds and initializes a new module.
         *
         * If the module with such name already exists, the method will do nothing,
         * because it cannot determine whether the actual module behind the name is the same,
         * while modules need to be fully reusable, even in dynamically loaded pages.
         *
         * @param {string} name
         * Module name.
         *
         * @param {function} cb
         * Module initialization function.
         */
        this.addModule = function (name, cb) {
            checkEntity(name, cb, 'module');
            if (!(name in modules)) {
                var s = {}; // module's scope
                modules[name] = s;
                cb.call(s, s);
            }
        };

        /**
         * @method ERoot#bind
         * @description
         * Searches for all elements in the document not yet bound, and binds them to controllers.
         *
         * Normally, a controller creates new controlled elements within its children, and then uses
         * {@link EController#bind EController.bind} method. It is only if you create a new controlled
         * element that's not a child element that you would use this global binding.
         *
         * You should try to avoid use of synchronous bindings, as they are hardly ever necessary,
         * while affecting performance of the application. The binding engine implements the logic
         * of minimizing the number of checks against the DOM, but it works best when requests are asynchronous.
         *
         * @param {boolean|function} [process=false]
         * Determines how to process the binding:
         * - _any falsy value (default):_ the binding will be done asynchronously;
         * - _a function:_ binding is asynchronous, calling the function when finished;
         * - _any truthy value, except a function type:_ forces synchronous binding.
         */
        this.bind = function (process) {
            bindElement(null, process);
        };

        /**
         * @method ERoot#find
         * @description
         * Searches for all initialized controllers, in the entire application, based on the controller name.
         *
         * The search is based solely on the internal map of controllers, without involving DOM, and provides instant results.
         * It will always significantly outperform method {@link EController#find EController.find},
         * even though the latter searches for only child elements, but it searches through DOM.
         *
         * @param {string} ctrlName
         * Controller name to search by.
         *
         * @returns {EController[]}
         * List of found initialized controllers.
         */
        this.find = function (ctrlName) {
            var cn = parseControllerName(ctrlName);
            if (cn in ctrlLive) {
                return ctrlLive[cn].slice();
            }
            return [];
        };

        /**
         * @method ERoot#findOne
         * @description
         * Searches for a single initialized controller, in the entire application, based on the controller name.
         *
         * It will throw an error, if multiple or no controllers found.
         *
         * @param {string} ctrlName
         * Controller name to search by.
         *
         * @returns {EController}
         * One controller matching the name.
         */
        this.findOne = function (ctrlName) {
            var a = this.find(ctrlName);
            if (a.length !== 1) {
                throw new Error('Expected a single controller from findOne(' + jStr(ctrlName) + '), but found ' + a.length + '.');
            }
            return a[0];
        };

    }

    /**
     * @event ERoot.onInit
     * @type {function}
     * @description
     * Called once in the beginning, after all controllers have been initialized.
     *
     * It represents the state of the application when it is ready to find controllers
     * and communicate with them.
     *
     * @see {@link EController.event:onInit EController.onInit}
     */

    /**
     * @interface EController
     * @description
     * Controller interface, attached to each controlled element in the DOM. Such elements
     * adhere to type {@link ControlledElement}.
     *
     * @see
     * {@link EController#name name},
     * {@link EController#node node},
     * {@link EController#bind bind},
     * {@link EController#depends depends},
     * {@link EController#extend extend},
     * {@link EController#find find},
     * {@link EController#findOne findOne},
     * {@link EController.event:onInit onInit},
     * {@link EController.event:onDestroy onDestroy}
     *
     * @param {string} name
     * Controller name.
     *
     * @param {ControlledElement} node
     * DOM element, associated with the controller.
     */
    function EController(name, node) {

        /**
         * @member EController#name
         * @type {string}
         * @readonly
         * @description
         * Full controller name.
         */
        readOnlyProp(this, 'name', name);

        /**
         * @member EController#node
         * @type {ControlledElement}
         * @readonly
         * @description
         * Source DOM element that uses this controller.
         */
        readOnlyProp(this, 'node', node);
    }

    /**
     * @event EController.onInit
     * @type {function}
     * @description
     * Initialization event handler.
     *
     * It represents the state of the controller when it is ready to do the following:
     *  - find other controllers and communicate with them
     *  - extend other controllers (via method {@link EController#extend extend})
     *
     * @see
     * {@link EController.event:onDestroy onDestroy},
     * {@link ERoot.event:onInit ERoot.onInit}
     */

    /**
     * @event EController.onDestroy
     * @type {function}
     * @description
     * De-initialization event handler.
     *
     * It signals the controller that its element has been removed from the DOM,
     * and it is time to release any pre-allocated resources, if necessary.
     *
     * For any modern browser, the event is triggered automatically, courtesy of `MutationObserver`,
     * while for older browsers, such as IE9 and IE10 it falls back on a manual background check
     * that runs every 500ms.
     *
     * @see
     * {@link ERoot.event:onInit ERoot.onInit}
     */

    /**
     * @method EController#bind
     * @description
     * Signals the framework that the element's content has been modified to contain new child controlled
     * elements, and that it is time to bind those elements and initialize its controllers.
     *
     * This method requires that its controller has been initialized.
     *
     * You should try to avoid use of synchronous bindings, as they are hardly ever necessary, while affecting
     * performance of the application. The binding engine implements the logic of minimizing the number of checks
     * against the DOM, but it works best when requests are asynchronous.
     *
     * @param {boolean|function} [process=false]
     * Determines how to process the binding:
     * - _any falsy value (default):_ the binding will be done asynchronously;
     * - _a function:_ binding is asynchronous, calling the function when finished;
     * - _any truthy value, except a function type:_ forces synchronous binding.
     */
    EController.prototype.bind = function (process) {
        this.verifyInit('bind');
        bindElement(this.node, process);
    };

    /**
     * @method EController#extend
     * @description
     * Extends other controller(s) with new functionality, thus providing functional inheritance.
     *
     * This method requires that its controller has been initialized.
     *
     * @param {string|string[]} ctrlName
     * Either a single controller name, or an array of names.
     *
     * @returns {EController|EController[]}
     * - if you pass in a single controller name, it returns a single controller.
     * - if you pass in an array of names, it returns an array of controllers.
     */
    EController.prototype.extend = function (ctrlName) {
        ctrlName = Array.isArray(ctrlName) ? ctrlName : [ctrlName];
        var ctrl = this.verifyInit('extend');

        function ext(name) {
            var cn = validCN(name, true);
            if (!cn) {
                throw new TypeError('Invalid controller name ' + jStr(name) + ' specified.');
            }
            var c = this.node.controllers[cn];
            if (!c) {
                c = new EController(cn, this.node);
                getCtrlFunc(cn).call(c, c);
                readOnlyProp(ctrl, cn, c);
                if (typeof c.onInit === 'function') {
                    c.onInit();
                }
            }
            return c;
        }

        return ctrlName.map(ext, this);
    };

    /**
     * @method EController#depends
     * @description
     * Verifies that each controller in the list of dependencies exists, or else throws an error.
     *
     * This optional level of verification is useful when sub-controllers are rarely used, or loaded
     * dynamically. Such explicit verification makes the code more robust.
     *
     * @param {string[]} ctrlNames
     * List of controller names.
     *
     * You would specify all controller names this controller may be extending via method {@link EController#extend extend},
     * plus any others that your controller may generate dynamically.
     */
    EController.prototype.depends = function (ctrlNames) {
        if (!Array.isArray(ctrlNames)) {
            throw new TypeError('Invalid list of controller names.');
        }
        ctrlNames.forEach(function (name) {
            var cn = validCN(name, true);
            if (!cn) {
                throw new TypeError('Invalid controller name ' + jStr(name) + ' specified.');
            }
            if (!getCtrlFunc(cn, true)) {
                throw new Error('Controller ' + jStr(this.name) + ' depends on ' + jStr(cn) + ', which was not found.');
            }
        }, this);
    };

    /**
     * @method EController#findOne
     * @description
     * Searches for a single initialized child controller by a given controller name.
     *
     * It will throw an error, if multiple or no controllers found.
     *
     * @param {string} ctrlName
     * Controller name to search by.
     *
     * @returns {EController}
     * One controller matching the name.
     */
    EController.prototype.findOne = function (ctrlName) {
        var a = this.find(ctrlName);
        if (a.length !== 1) {
            throw new Error('Expected a single controller from ' + jStr(this.name) + '.findOne(' + jStr(ctrlName) + '), but found ' + a.length + '.');
        }
        return a[0];
    };

    /**
     * @method EController#find
     * @description
     * Searches for all initialized child controllers by a given controller name.
     *
     * This method searches through DOM, as it needs to iterate over child elements.
     * And because of that, even though it searches just through a sub-set of elements,
     * it is always slower than the global {@link ERoot#find ERoot.find} method.
     *
     * @param {string} ctrlName
     * Controller name to search by.
     *
     * @returns {EController[]}
     * List of initialized child controllers.
     *
     * @see {@link ERoot#find ERoot.find}
     */
    EController.prototype.find = function (ctrlName) {
        var cn = parseControllerName(ctrlName);
        var s = '[data-e-bind*="' + cn + '"],[e-bind*="' + cn + '"]'; // selectors
        return findAll(s, this.node).filter(pick).map(pick);

        function pick(e) {
            // This also caters for dynamically created controlled
            // elements that haven't been initialized yet:
            return e.controllers && e.controllers[cn];
        }
    };

    /**
     * @method EController#verifyInit
     * @private
     * @description
     * Verifies that this controller has been initialized, or else throws an error.
     *
     * This method is for internal use only.
     *
     * @param {string} m
     * Name of the method that requires verification.
     *
     * @returns {EController[]}
     * Controllers linked to the element.
     */
    EController.prototype.verifyInit = function (m) {
        var c = this.node.controllers;
        if (!c) {
            throw new Error('Method "' + m + '" cannot be used before initialization.');
        }
        return c;
    };

    /**
     * Sets the default root name, plus the alternative root name, if it is specified.
     */
    (function () {
        window.excellent = root; // default root name
        var e = findAll('[data-e-root],[e-root]');
        if (e.length) {
            if (e.length > 1) {
                throw new Error('Multiple root elements are not allowed.');
            }
            var name = getAttribute(e[0], 'data-e-root', 'e-root');
            if (!validJsVariable(name)) {
                throw new Error('Invalid ' + jStr(name) + ' root name specified.');
            }
            window[name] = root; // alternative root name
        }
    })();

})();
