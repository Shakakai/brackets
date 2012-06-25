/*
 * Copyright (c) 2012 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */


/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global $, window, define, describe, beforeEach, afterEach, it, runs, waitsFor, expect, brackets, waitsForDone */

define(function (require, exports, module) {
    'use strict';

    var CommandManager,         // load from test Window
        Commands,               // load from test Window
        EditorManager,          // load from test Window
        PerformanceReporter     = require("perf/PerformanceReporter"),
        PerfUtils               = require("utils/PerfUtils"),
        SpecRunnerUtils         = require("spec/SpecRunnerUtils");
    
    // http://paulirish.com/2011/requestanimationframe-for-smart-animating/
    // shim layer with setTimeout fallback
    var requestAnimFrame = (function () {
        return window.requestAnimationFrame    ||
            window.webkitRequestAnimationFrame ||
            window.mozRequestAnimationFrame    ||
            window.oRequestAnimationFrame      ||
            window.msRequestAnimationFrame     ||
            function (callback) {
                window.setTimeout(callback, 1000 / 60);
            };
    }());

    var STRING_FIRSTPAINT        = "Typing Speed: First repaint",
        STRING_PAINTBEFORECHANGE = "Typing Speed: Paint before DOM update",
        STRING_ONCHANGE          = "Typing Speed: DOM update complete",
        STRING_PAINTAFTERCHANGE  = "Typing Speed: Paint after DOM update";
    
    var testPath = SpecRunnerUtils.getTestPath("/perf/TypingSpeed-files"),
        editor,
        inputField,
        inProgress;
    
    function inputChangedHandler(spec) {
        // CodeMirror's fastPoll will batch up input events into a consolidated change
        if (inProgress) {
            return;
        }
        
        inProgress = true;

        // use a single markStart call so all start times are the same
        PerfUtils.markStart([
            STRING_FIRSTPAINT,
            STRING_PAINTBEFORECHANGE,
            STRING_ONCHANGE,
            STRING_PAINTAFTERCHANGE
        ]);
    
        var repaintBeforeChangeHandler = function () {
            if (PerfUtils.isActive(STRING_FIRSTPAINT)) {
                PerfUtils.addMeasurement(STRING_FIRSTPAINT);
            }
            
            if (PerfUtils.isActive(STRING_ONCHANGE)) {
                // don't know which paint event will be the last one,
                // so keep updating measurement until we hit onChange
                PerfUtils.updateMeasurement(STRING_PAINTBEFORECHANGE);
                requestAnimFrame(repaintBeforeChangeHandler);
            }
        };
        
        var repaintAfterChangeHandler = function () {
            PerfUtils.addMeasurement(STRING_PAINTAFTERCHANGE);

            // need to tell PerfUtils that we are done updating this measurement
            PerfUtils.finalizeMeasurement(STRING_PAINTBEFORECHANGE);

            inProgress = false;
        };
    
        var onChangeHandler = function (event, editor, change) {
            PerfUtils.addMeasurement(STRING_ONCHANGE);
            $(editor).off("change.typingSpeedLogger", onChangeHandler);

            requestAnimFrame(repaintAfterChangeHandler);
        };
        
        requestAnimFrame(repaintBeforeChangeHandler);
        $(editor).on("change.typingSpeedLogger", onChangeHandler);
    }
    
    function _getInputField(editor) {
        return editor._codeMirror.getInputField();
    }
        
    function uninstall() {
        inputField.removeEventListener("input", inputChangedHandler, true);
        editor = null;
        inputField = null;
    }

    function install() {
        editor = EditorManager.getFocusedEditor();
        inputField = _getInputField(editor);
        
        // Listen for input changes in the capture phase, before
        // CodeMirror's event handling.
        // WHY YOU NO WORKY!?
        // inputField.addEventListener("input", inputChangedHandler, true);
        inputField.oninput = inputChangedHandler;
        
        // reset
        inProgress = false;
    }
    
    function doType(str, repeatCount, repeatInterval, expectedInterval) {
        var perfPaintAfterChange,
            actualCount = 0;
        
        repeatInterval = repeatInterval || 30;
        expectedInterval = expectedInterval || 40;
        repeatCount = repeatCount || 1;
        
        function doInputChange() {
            inputField.value = inputField.value.concat(str);
            actualCount++;
            
            if (actualCount < repeatCount) {
                window.setTimeout(doInputChange, repeatInterval);
            }
        }
        
        // start typing!
        doInputChange();
        
        waitsFor(function () {
            perfPaintAfterChange = perfPaintAfterChange || PerfUtils.getData(STRING_PAINTAFTERCHANGE);
            
            if (!Array.isArray(perfPaintAfterChange)) {
                return false;
            }
            
            return (perfPaintAfterChange.length === repeatCount);
        }, "doInputChange", (expectedInterval * repeatCount)); // 40ms interval * 80 chars
    }
    
    describe("Typing Speed", function () {
        
        this.performance = true;
        
        beforeEach(function () {
            SpecRunnerUtils.createTestWindowAndRun(this, function (testWindow) {
                // Load module instances from brackets.test
                Commands          = testWindow.brackets.getModule("command/Commands");
                CommandManager    = testWindow.brackets.getModule("command/CommandManager");
                EditorManager     = testWindow.brackets.getModule("editor/EditorManager");
                SpecRunnerUtils.loadProjectInTestWindow(testPath);
            });
        });

        afterEach(function () {
            SpecRunnerUtils.closeTestWindow();
        });
        
        it("should meet expected response times based for the fastest native OS key repeat rates", function () {
            var promise;

            runs(function () {
                promise = CommandManager.execute(Commands.FILE_OPEN, {fullPath: testPath + "/blank.js"});
                waitsForDone(promise, "FILE_OPEN");
            });
            
            runs(function () {
                install();
                doType("-", 80, 30);
            });
            
            runs(function () {
                PerformanceReporter.logTestWindow(STRING_PAINTAFTERCHANGE, null, "avg");
            });
        });
        
        it("should measure a simulated slow down", function () {
        });
        
    });
});
