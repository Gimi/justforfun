//> This file is part of Ymacs, an Emacs-like editor for the Web
//> http://www.ymacs.org/
//>
//> Copyright (c) 2009, Mihai Bazon, Dynarch.com.  All rights reserved.
//>
//> Redistribution and use in source and binary forms, with or without
//> modification, are permitted provided that the following conditions are
//> met:
//>
//>     * Redistributions of source code must retain the above copyright
//>       notice, this list of conditions and the following disclaimer.
//>
//>     * Redistributions in binary form must reproduce the above copyright
//>       notice, this list of conditions and the following disclaimer in
//>       the documentation and/or other materials provided with the
//>       distribution.
//>
//>     * Neither the name of Dynarch.com nor the names of its contributors
//>       may be used to endorse or promote products derived from this
//>       software without specific prior written permission.
//>
//> THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER “AS IS” AND ANY
//> EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
//> IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
//> PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE LIABLE
//> FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
//> CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
//> SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
//> INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
//> CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
//> ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF
//> THE POSSIBILITY OF SUCH DAMAGE.

// @require ymacs-buffer.js
// @require ymacs-keymap.js

Ymacs_Buffer.newMode("minibuffer_mode", function(){
        var marker = this.createMarker(0, true);
        var changed_vars = this.setq({
                minibuffer_end_marker: marker
        });
        var keymap = Ymacs_Keymap_Minibuffer();
        this.pushKeymap(keymap);
        return function() {
                this.setq(changed_vars);
                marker.destroy();
                this.popKeymap(keymap);
        };
});

(function(){

        var $popupActive = false;
        var $menu = null, $item = null;
        function popupCompletionMenu(frame, list) {
                if ($menu)
                        $menu.destroy();
                $menu = new DlVMenu({});
                list.foreach(function(item){
                        new DlMenuItem({ parent: $menu, label: item.htmlEscape(), data: item });
                });
                var popup = Ymacs_Completion_Popup.get();
                popup.popup({
                        timeout: 0,
                        content: $menu,
                        align: {
		                prefer: "Tr",
		                fallX1: "_r",
		                fallX2: "_L",
		                fallY1: "B_",
		                fallY2: "T_"
	                },
                        anchor: frame.getCaretElement(),
                        widget: frame,
                        onHide: function() {
                                $popupActive = false;
                                // $menu.destroy();
                                $item = null;
                                $menu = null;
                        },
                        isContext: true
                });
                $popupActive = true;
        };

        function read_with_continuation(completions, cont, validate) {
                this.whenMinibuffer(function(mb){
                        var changed_vars = mb.setq({
                                completion_list: completions,
                                minibuffer_validation: function(what){
                                        if (what == null)
                                                what = mb.cmd("minibuffer_contents");
                                        if (validate)
                                                return validate.call(this, mb, what);
                                        return true; // accept anything by default
                                }.$(this),
                                minibuffer_continuation: function(what){
                                        mb.setq(changed_vars);
                                        if (cont)
                                                cont.call(this, what);
                                }.$(this)
                        });
                });
        };

        Ymacs_Buffer.newCommands({

                minibuffer_prompt: function(prompt, nofocus) {
                        this.whenMinibuffer(function(mb){
                                var f = this.getMinibufferFrame();
                                mb.setCode("");
                                mb.cmd("prevent_undo", function(){
                                        mb.cmd("insert", prompt);
                                });
                                mb.getq("minibuffer_end_marker").setPosition(mb.point());
                                f._redrawCaret(true);
                                if (!nofocus)
                                        f.focus();
                        });
                },

                minibuffer_read_number: function(cont) {
                        read_with_continuation.call(this, null, cont, function(mb, text){
                                var n = parseInt(text, 10);
                                if (isNaN(n))
                                        mb.signalError("Please enter a number");
                                return !isNaN(n);
                        });
                },

                minibuffer_read_command: function(cont) {
                        var commandNames = Array.hashKeys(this.COMMANDS).grep(function(cmd){
                                return this.COMMANDS[cmd].ymacsInteractive;
                        }, this).sort();
                        read_with_continuation.call(this, commandNames, cont, function(mb, name){
                                var cmd = this.COMMANDS[name],
                                    ret = cmd && cmd.ymacsInteractive;
                                if (!ret) {
                                        mb.signalError("No such command: " + name);
                                }
                                return ret;
                        });
                },

                minibuffer_read_function: function(cont) {
                        var commandNames = Array.hashKeys(this.COMMANDS).sort();
                        read_with_continuation.call(this, commandNames, cont, function(mb, name){
                                var cmd = this.COMMANDS[name],
                                    ret = !!cmd;
                                if (!ret)
                                        mb.signalError("No such function: " + name);
                                return ret;
                        });
                },

                minibuffer_read_buffer: function(cont) {
                        this.whenYmacs(function(ymacs){
                                var bufferNames = ymacs.buffers.map("name");
                                bufferNames.push(bufferNames.shift());
                                read_with_continuation.call(this, bufferNames, cont);
                                handle_tab.call(this);
                        });
                },

                minibuffer_read_string: function(completions, cont) {
                        read_with_continuation.call(this, completions, cont);
                },

                minibuffer_prompt_end: function() {
                        return this.whenMinibuffer(function(mb){
                                return mb.getq("minibuffer_end_marker").getPosition();
                        });
                },

                minibuffer_contents: function() {
                        return this.whenMinibuffer(function(mb){
                                return mb._bufferSubstring(mb.getq("minibuffer_end_marker"));
                        });
                },

                minibuffer_replace_input: function(value) {
                        this.whenMinibuffer(function(mb){
                                mb._replaceText(mb.getq("minibuffer_end_marker"), mb.getCodeSize(), value);
                                this.getMinibufferFrame()._redrawCaret(true);
                        });
                },

                minibuffer_complete: function() {
                        this.whenMinibuffer(function(mb){
                                var a = mb.getq("completion_list"),
                                    str = mb.cmd("minibuffer_contents"),
                                    str2 = str.replace(/-/g, "_");
                                if (a && a.length > 0) {
                                        a = a.grep(function(cmd){
                                                return cmd.indexOf(str) == 0 || cmd.indexOf(str2) == 0;
                                        });
                                }
                                if (!a || a.length == 0) {
                                        mb.signalError("No completions");
                                }
                                else {
                                        var prefix = a.common_prefix();
                                        if (prefix != str) {
                                                mb.cmd("minibuffer_replace_input", prefix);
                                        }
                                        else if (a.length == 1) {
                                                mb.signalError("Sole completion");
                                        }
                                        else {
                                                popupCompletionMenu(this.getMinibufferFrame(), a);
                                        }
                                }
                        });
                },

                minibuffer_complete_and_exit: function() {
                        this.whenMinibuffer(function(mb){
                                if (mb.getq("minibuffer_validation").call(mb)) {
                                        mb.cmd("minibuffer_keyboard_quit", this.getq("minibuffer_continuation"));
                                }
                        });
                },

                minibuffer_keyboard_quit: function(cont) {
                        this.whenMinibuffer(function(mb){
                                var text = this.cmd("minibuffer_contents");
                                mb.setCode("");
                                this.cmd("other_frame");
                                (function(text){
                                        if (cont)
                                                cont.call(this, text);
                                        this.getPrefixArg();
                                }).delayed(1, this, text);
                        });
                        DlPopup.clearAllPopups();
                }

        });

        function handle_completion(how) {
                var old_item = $item, w;
                switch (how) {
                    case "next":
                        if ($item == null)
                                $item = -1;
                        $item = $menu.children().rotateIndex(++$item);
                        break;
                    case "prev":
                        if ($item == null)
                                $item = 0;
                        $item = $menu.children().rotateIndex(--$item);
                        break;
                }
                if (old_item != null) {
                        w = $menu.children(old_item);
			w.callHooks("onMouseLeave");
                }
                old_item = $item;
                w = $menu.children($item);
		w.callHooks("onMouseEnter");
        };

        function handle_arrow_down() {
                if ($popupActive) {
                        return handle_completion.call(this, "next");
                }
        };

        function handle_arrow_up() {
                if ($popupActive) {
                        return handle_completion.call(this, "prev");
                }
        };

        function handle_enter() {
                if ($popupActive) {
                        if ($item != null) {
                                this.cmd("minibuffer_replace_input", $menu.children()[$item].userData);
                                DlPopup.clearAllPopups();
                        } else {
                                this.signalError("Select something...");
                        }
                }
                this.cmd("minibuffer_complete_and_exit");
        };

        function handle_tab() {
                if (!$popupActive)
                        this.cmd("minibuffer_complete");
                handle_arrow_down.call(this); // autoselect the first one anyway
        };

        function handle_s_tab() {
                handle_arrow_up.call(this);
        };

        function handle_escape() {
                if ($popupActive) {
                        DlPopup.clearAllPopups();
                } else {
                        this.cmd("minibuffer_keyboard_quit");
                }
        };

        DEFINE_SINGLETON("Ymacs_Keymap_Minibuffer", Ymacs_Keymap, function(D, P){

                D.KEYS = {
                        "C-g"         : "minibuffer_keyboard_quit",
                        "TAB"         : handle_tab,
                        "S-TAB"       : handle_s_tab,
                        "ARROW_DOWN"  : handle_arrow_down,
                        "ARROW_UP"    : handle_arrow_up,
                        "ENTER"       : handle_enter,
                        "ESCAPE"      : handle_escape
                };

                P.defaultHandler = [ function() {
                        DlPopup.clearAllPopups();
                        return false; // say it's not handled though
                } ];

        });

})();

DEFINE_CLASS("Ymacs_Completion_Popup", DlCompletionPopup);
