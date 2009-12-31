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

// @require ymacs.js

DEFINE_CLASS("Ymacs_Frame", DlContainer, function(D, P, DOM) {

        var DBL_CLICK_SPEED = 300;

        var EX = DlException.stopEventBubbling;

        D.DEFAULT_EVENTS = [ "onPointChange" ];

        D.DEFAULT_ARGS = {
                highlightCurrentLine : [ "highlightCurrentLine" , true ],
                buffer               : [ "buffer"               , null ],
                ymacs                : [ "ymacs"                , null ],
                isMinibuffer         : [ "isMinibuffer"         , false ],

                // override in DlContainer
                _scrollBars          : [ "scroll"               , true ],

                // override in DlWidget
                _focusable           : [ "focusable"            , true ],
                _fillParent          : [ "fillParent"           , true ]
        };

        var BLINK_TIMEOUT = 200;

        D.CONSTRUCT = function() {
                this.__blinkCaret = this.__blinkCaret.$(this);
                this.__caretId = Dynarch.ID();
                this._bufferEvents = {
                        onLineChange             : this._on_bufferLineChange.$(this),
                        onInsertLine             : this._on_bufferInsertLine.$(this),
                        onDeleteLine             : this._on_bufferDeleteLine.$(this),
                        onPointChange            : this._on_bufferPointChange.$(this),
                        onResetCode              : this._on_bufferResetCode.$(this),
                        onOverwriteMode          : this._on_bufferOverwriteMode.$(this),
                        beforeInteractiveCommand : this._on_bufferBeforeInteractiveCommand.$(this)
                };
                this._moreBufferEvents = {
                        onMessage       : this._on_bufferMessage.$(this),
                        onOverlayChange : this._on_bufferOverlayChange.$(this),
                        onOverlayDelete : this._on_bufferOverlayDelete.$(this)
                };
                var buffer = this.buffer;
                this.buffer = null;
                if (buffer)
                        this.setBuffer(buffer);
        };

        P.initDOM = function() {
                D.BASE.initDOM.apply(this, arguments);
                this.getElement().innerHTML = "<div class='Ymacs-frame-content'></div>";
                this.addEventListener({
                        onDestroy   : this._on_destroy,
                        onFocus     : this._on_focus,
                        onBlur      : this._on_blur,
                        onMouseDown : this._on_mouseDown,
                        // onKeyDown   : this._on_keyPress,
                        onKeyPress  : this._on_keyPress,
                        onResize    : this.centerOnCaret
                });
                this._dragSelectCaptures = {
                        onMouseOver  : EX,
                        onMouseOut   : EX,
                        onMouseEnter : EX,
                        onMouseLeave : EX,
                        onMouseMove  : _dragSelect_onMouseMove.$(this),
                        onMouseUp    : _dragSelect_onMouseUp.$(this)
                };
        };

        P.focus = function(exitAllowed) {
                D.BASE.focus.call(this);
                if (exitAllowed instanceof Function) {
                        this.removeEventListener("onBlur", this.__exitFocusHandler);
                        this.addEventListener("onBlur", this.__exitFocusHandler = function(){
                                if (exitAllowed.call(this.buffer)) {
                                        this.removeEventListener("onBlur", this.__exitFocusHandler);
                                } else {
                                        this.focus.delayed(2, this, null);
                                }
                        });
                }
        };

        P.blur = function(force) {
                if (force)
                        this.removeEventListener("onBlur", this.__exitFocusHandler);
                D.BASE.blur.call(this);
        };

        P.getContentElement = function() {
                return this.getElement().firstChild;
        };

        P.getCaretElement = function() {
                return document.getElementById(this.__caretId);
        };

        P.getLineDivElement = function(row) {
                return this.getContentElement().childNodes[row];
        };

        P.ensureCaretVisible = function() {
                this._redrawCaret();

                var caret = this.getCaretElement();
                if (!caret)
                        return;
                var div = this.getElement(), line = this.getLineDivElement(this.buffer._rowcol.row);

                // vertical
                var diff = line.offsetTop + line.offsetHeight - (div.scrollTop + div.clientHeight);
                if (diff > 0) {
                        div.scrollTop += diff;
                } else {
                        diff = line.offsetTop - div.scrollTop;
                        if (diff < 0) {
                                div.scrollTop += diff;
                        }
                }

                // horizontal
                diff = caret.offsetLeft + caret.offsetWidth - (div.scrollLeft + div.clientWidth);
                // if (caret.offsetLeft + caret.offsetWidth < div.clientWidth)
                //         div.scrollLeft = 0;
                if (diff > 0) {
                        div.scrollLeft += diff;
                } else {
                        diff = caret.offsetLeft - div.scrollLeft;
                        if (diff < 0)
                                div.scrollLeft += diff;
                }
        };

        P.setBuffer = function(buffer) {
                if (this.buffer) {
                        if (this.caretMarker && !this.isMinibuffer) {
                                this.caretMarker.destroy();
                                this.caretMarker = null;
                        }
                        this.buffer.removeEventListener(this._bufferEvents);
                        this.buffer.removeEventListener(this._moreBufferEvents);
                }
                this.buffer = buffer;
                if (buffer) {
                        this.buffer.addEventListener(this._bufferEvents);
                        if (this.focusInside()) {
                                buffer.addEventListener(this._moreBufferEvents);
                        }
                        if (this.isMinibuffer) {
                                this.caretMarker = buffer.caretMarker;
                        } else {
                                this.caretMarker = buffer.createMarker(buffer.caretMarker.getPosition());
                        }
                        this._redrawBuffer();
                        this._redrawCaret(true);
                        this.centerOnCaret();
                }
        };

        P.centerOnCaret = function() {
                this.centerOnLine(this.buffer._rowcol.row);
        };

        P.centerOnLine = function(row) {
                var line = this.getLineDivElement(row), div = this.getElement();
                div.scrollTop = Math.round(line.offsetTop - div.clientHeight / 2 + line.offsetHeight / 2);
                // this._redrawBuffer();
        };

        P.deleteOtherFrames = function() {
                this.ymacs.keepOnlyFrame(this);
        };

        P.vsplit = function() {
                var cont = this.parent;

                // we need a new container for this frame (c1) and one for the sister frame (c2)
                var c1 = new DlContainer({});
                var c2 = new DlContainer({});
                c1.appendWidget(this);

                // clone the frame
                var fr = this.ymacs.createFrame({ parent: c2, buffer: this.buffer });

                // now create a layout, pack c1 and c2 and a resize bar
                var layout = new DlLayout({ parent: cont });
                layout.packWidget(c1, { pos: "top", fill: "50%" });
                var rb = new DlResizeBar({ widget: c1, horiz: true });
                layout.packWidget(rb, { pos: "top" });
                layout.packWidget(c2, { pos: "top", fill: "*" });

                // update dimensions
                cont.__doLayout();
        };

        P.hsplit = function() {
                var cont = this.parent;

                // we need a new container for this frame (c1) and one for the sister frame (c2)
                var c1 = new DlContainer({});
                var c2 = new DlContainer({});
                c1.appendWidget(this);

                // clone the frame
                var fr = this.ymacs.createFrame({ parent: c2, buffer: this.buffer });

                // now create a layout, pack c1 and c2 and a resize bar
                var layout = new DlLayout({ parent: cont });
                layout.packWidget(c1, { pos: "left", fill: "50%" });
                var rb = new DlResizeBar({ widget: c1 });
                layout.packWidget(rb, { pos: "left" });
                layout.packWidget(c2, { pos: "left", fill: "*" });

                // update dimensions
                cont.__doLayout();
        };

        P.toggleLineNumbers = function() {
                this.condClass(this.__lineNumbers =! this.__lineNumbers, "Ymacs-line-numbers");
        };

        function insertInText(div, col, el) {
                // this is for empty lines
                if (/^br$/i.test(div.firstChild.tagName)) {
                        div.insertBefore(el, div.firstChild);
                        return el;
                }
                var len = 0, OUT = {};
                function walk(div) {
                        for (var i = div.firstChild; i; i = i.nextSibling) {
                                if (i.nodeType == 3 /* TEXT */) {
                                        var clen = i.length;
                                        if (len + clen > col) {
                                                var pos = col - len; // here we should insert it, relative to the current node
                                                var next = i.splitText(pos);
                                                div.insertBefore(el, next);
                                                throw OUT;
                                        }
                                        else if (len + clen == col) {
                                                // this case is simpler; it could have been treated
                                                // above, but let's optimize a bit since there's no need
                                                // to split the text.
                                                div.insertBefore(el, i.nextSibling);
                                                throw OUT;
                                        }
                                        len += clen;
                                }
                                else if (i.nodeType == 1 /* ELEMENT */) {
                                        walk(i); // recurse
                                }
                        }
                };
                try {
                        walk(div);
                }
                catch(ex) {
                        if (ex === OUT)
                                return el;
                        throw ex;
                }
        };

        P.setMarkerAtPos = function(row, col) {
                if (!row.tagName) // accept an element as well
                        row = this.getLineDivElement(row);
                if (row)
                        return insertInText(row, col, DOM.createElement("span"));
        };

        P.__restartBlinking = function() {
                this.__stopBlinking();
                if (this.focusInside()) {
                        this.__caretTimer = setInterval(this.__blinkCaret, BLINK_TIMEOUT);
                }
        };

        P.__stopBlinking = function() {
                clearInterval(this.__caretTimer);
                this.__showCaret();
        };

        P.__blinkCaret = function() {
                DOM.condClass(this.getCaretElement(), this.BLINKING = ! this.BLINKING, "Ymacs-caret");
        };

        P.__showCaret = function() {
                DOM.addClass(this.getCaretElement(), "Ymacs-caret");
        };

        P._unhoverLine = function() {
                if (this.__hoverLine != null) {
                        DOM.delClass(this.getLineDivElement(this.__hoverLine), "Ymacs-current-line");
                        this.__hoverLine = null;
                }
        };

        P._redrawCaret = function(force) {
                var isActive = this.ymacs.getActiveFrame() === this;
                if (!force && !isActive)
                        return;

                if (isActive && !this.isMinibuffer)
                        this.caretMarker.setPosition(this.buffer.caretMarker.getPosition());

                var rc = this.buffer._rowcol;

                if (this.highlightCurrentLine) {
                        this._unhoverLine();
                        DOM.addClass(this.getLineDivElement(rc.row), "Ymacs-current-line");
                        this.__hoverLine = rc.row;
                }

                // redraw the line where the caret was previously, so that it disappears from there
                if (this.__prevCaretLine != null) {
                        this._on_bufferLineChange(this.__prevCaretLine);
                }

                // redraw current line if it's different
                if (this.__prevCaretLine != rc.row) {
                        this.__prevCaretLine = rc.row;
                        this._on_bufferLineChange(rc.row);
                }

                if (isActive)
                        this.__restartBlinking();

                this.callHooks("onPointChange", rc.row, rc.col);
        };

        P._getLineHTML = function(row) {
                var html = this.buffer.formatLineHTML(row, this.caretMarker);
                // taking advantage of the fact that a literal > entered by the user will never appear in
                // the generated HTML, since special HTMl characters are escaped.
                var pos = html.indexOf("Ymacs-caret'>");
                if (pos >= 0) {
                        html = html.substr(0, pos + 12)
                                + " id='" + this.__caretId + "'"
                                + html.substr(pos + 12);
                }
                return html;
        };

        P._redrawBuffer = function() {
                this.setContent(this.buffer.code.map(function(line, i){
                        return this._getLineHTML(i).htmlEmbed("div", "line");
                }, this).join(""));
        };

        P.coordinatesToRowCol = function(x, y) {
                function findLine(r1, r2) {
                        if (r1 == r2)
                                return r1;
                        var row = Math.floor((r1 + r2) / 2),
                            div = self.getLineDivElement(row),
                            y1  = div.offsetTop,
                            y2  = y1 + div.offsetHeight - 1;
                        if (y2 < y)
                                return findLine(row + 1, r2);
                        if (y < y1)
                                return findLine(r1, row - 1);
                        return row;
                };
                function findCol(c1, c2) {
                        if (c1 == c2)
                                return c1;
                        var col = Math.floor((c1 + c2) / 2);
                        var p1 = self.coordinates(row, col),
                            p2 = self.coordinates(row, col + 1);
                        if (p2.x < x)
                                return findCol(col + 1, c2);
                        if (x < p1.x)
                                return findCol(c1, col - 1);
                        return col;
                };
                var self = this,
                    row = findLine(0, this.buffer.code.length - 1),
                    col = findCol(0, this.buffer.code[row].length);
                return { row: row, col: col };
        };

        P.coordinates = function(row, col) {
                var div = this.getLineDivElement(row);
                var span = this.setMarkerAtPos(div, col);
                var ret = { x: span.offsetLeft, y: div.offsetTop, h: div.offsetHeight };
                DOM.trash(span);
                return ret;
        };

        P.heightInLines = function() {
                return Math.floor(this.getElement().clientHeight / this.getCaretElement().offsetHeight);
        };

        /* -----[ event handlers ]----- */

        P._on_bufferLineChange = function(row) {
                var div = this.getLineDivElement(row);
                if (div) {
                        div.innerHTML = this._getLineHTML(row);
                }
        };

        P._on_bufferInsertLine = function(row, drawIt) {
                var div;
                if (drawIt)
                        div = DOM.createFromHtml(this._getLineHTML(row).htmlEmbed("div", "line"));
                else
                        div = DOM.createElement("div", null, { className: "line" });
                this.getContentElement().insertBefore(div, this.getLineDivElement(row));
        };

        P._on_bufferDeleteLine = function(row) {
                DOM.trash(this.getLineDivElement(row));
        };

        P._on_bufferPointChange = function(rc, pos) {
                this._redrawCaret();
        };

        P._on_bufferResetCode = function() {
                this._redrawBuffer();
        };

        P._on_bufferOverwriteMode = function(om) {
                this.condClass(om, "Ymacs-overwrite-mode");
        };

        P._on_bufferMessage = function(type, text, html) {
                var anchor = this.isMinibuffer ? this.ymacs : this;
                var popup = Ymacs_Message_Popup.get(0);
                popup.popup({
                        content : html ? text : text.htmlEscape(),
                        widget  : anchor,
                        anchor  : anchor.getElement(),
                        align   : { prefer: "CC", fallX1: "CC", fallX2: "CC", fallY1: "CC", fallY2: "CC" }
                });
                popup.hide(5000);
        };

        P._on_bufferBeforeInteractiveCommand = function() {
                this._unhoverLine();
                Ymacs_Message_Popup.clearAll();
        };

        P.getOverlayId = function(name) {
                return this.id + "-ovl-" + name;
        };

        P.getOverlayHTML = function(name, props) {
                if (props.line1 == props.line2 && props.col1 == props.col2)
                        // empty overlay, don't display
                        return null;
                var p1 = this.coordinates(props.line1, props.col1);
                var p2 = this.coordinates(props.line2, props.col2);
                var str = String.buffer(
                        "<div id='", this.getOverlayId(name), "' class='Ymacs_Overlay ", name,
                        "' style='top:", p1.y, "px'>"
                );
                if (props.line1 == props.line2) {
                        str("<div class='", name, "' style='margin-left:", p1.x,
                            "px; width:", p2.x - p1.x, "px;height:", p2.h, "px;'>&nbsp;</div>");
                } else {
                        str("<div class='", name, "' style='margin-left:", p1.x, "px;height:", p1.h, "px;'>&nbsp;</div>");
                        if (props.line2 - props.line1 > 1)
                                str("<div class='", name, "' style='height:", p2.y - p1.y - p1.h, "px'></div>");
                        str("<div class='", name, "' style='width:", p2.x, "px;height:", p2.h, "px;'>&nbsp;</div>");
                }
                str("</div>");
                return str.get();
        };

        P.getOverlaysCount = function() {
                return this.getElement().childNodes.length - 1; // XXX: subtract the div.content; we need to revisit this if we add new elements.
        };

        P._on_bufferOverlayChange = function(name, props, isNew) {
                if (!isNew) {
                        DOM.trash($(this.getOverlayId(name)));
                }
                var div = this.getOverlayHTML(name, props);
                if (div) {
                        div = DOM.createFromHtml(div);
                        this.getElement().appendChild(div);
                        this.condClass(this.getOverlaysCount() > 0, "Ymacs_Frame-hasOverlays");
                }
        };

        P._on_bufferOverlayDelete = function(name, props, isNew) {
                DOM.trash($(this.getOverlayId(name)));
                this.condClass(this.getOverlaysCount() > 0, "Ymacs_Frame-hasOverlays");
        };

        /* -----[ self events ]----- */

        P._on_destroy = function() {
                this.setBuffer(null);
                this.__stopBlinking();
        };

        P._on_focus = function() {
                window.focus();
                // console.log("FOCUS for %s", this.buffer.name);
                this.ymacs.setActiveFrame(this, true);
                if (!this.isMinibuffer) {
                        this.buffer.cmd("goto_char", this.caretMarker.getPosition());
                }
                this.buffer.addEventListener(this._moreBufferEvents);
                this.__restartBlinking();
        };

        P._on_blur = function() {
                // console.log("BLUR for %s", this.buffer.name);
                if (!this.isMinibuffer) {
                        this.caretMarker.setPosition(this.buffer.caretMarker.getPosition());
                }
                this.buffer.removeEventListener(this._moreBufferEvents);
                this.__stopBlinking();
        };

        var CLICK_COUNT = 0, CLICK_COUNT_TIMER = null, CLICK_LAST_TIME = null;
        function CLEAR_CLICK_COUNT() { CLICK_COUNT = null };

        P._on_mouseDown = function(ev) {
                clearTimeout(CLICK_COUNT_TIMER);
                CLICK_COUNT++;
                CLICK_COUNT_TIMER = CLEAR_CLICK_COUNT.delayed(DBL_CLICK_SPEED);

                this.__restartBlinking();
                var pos = ev.computePos(this.getContentElement()),
                    rc = this.coordinatesToRowCol(pos.x, pos.y),
                    buf = this.buffer;

                buf.clearTransientMark();
                buf.cmd("goto_char", buf._rowColToPosition(rc.row, rc.col));
                if (CLICK_COUNT == 1) {
                        buf.ensureTransientMark();
                        DlEvent.captureGlobals(this._dragSelectCaptures);
                }
                else if (CLICK_COUNT == 2) {
                        buf.cmd("backward_word");
                        buf.cmd("forward_word_mark");
                }
                else if (CLICK_COUNT == 3) {
                        buf.cmd("beginning_of_line");
                        buf.cmd("end_of_line_mark");
                }
                else if (CLICK_COUNT == 4) {
                        buf.cmd("backward_paragraph");
                        buf.cmd("forward_whitespace");
                        buf.cmd("beginning_of_line");
                        buf.cmd("forward_paragraph_mark");
                }

                EX();
        };

        function _dragSelect_onMouseMove(ev) {
                var pos = ev.computePos(this.getContentElement()),
                    rc = this.coordinatesToRowCol(pos.x, pos.y);
                this.buffer.cmd("goto_char", this.buffer._rowColToPosition(rc.row, rc.col));
                this.buffer.ensureTransientMark();
                this.ensureCaretVisible();
        };

        function _dragSelect_onMouseUp(ev) {
                DlEvent.releaseGlobals(this._dragSelectCaptures);
        };

        P._on_keyPress = function(ev) {
                if (this.buffer._handleKeyEvent(ev))
                        EX();
        };

});

DEFINE_CLASS("Ymacs_Message_Popup", DlPopup, function(D, P) {
        D.FIXARGS = function(args) {
                args.focusable = false;
                args.autolink = false;
                args.zIndex = 5000;
        };
});
