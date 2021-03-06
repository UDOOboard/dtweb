function initBoard(config) {
    var container, child, pinFeatures = [];
    
    container = $("#features");
    for (var feature in config) {
        if (config.hasOwnProperty(feature)) {
            child = $("<li></li>");
            child.text(config[feature].description).addClass("function-"+feature+" list-group-item list-group-item-"+config[feature].cssClass);
            child.data("feature", feature);
            if (config[feature].help) {
                child.append('<span class="badge" title="'+config[feature].help+'">?</span>');
            }
            child.appendTo(container);
            child.draggable({
                revert: "invalid",
                helper: function(event) {
                    return $("<div class='dragobj'></div>");
                },
                cursorAt: { top: 3, left: 3 }
            });
        }
    }
    
    for (var i=window.board.minPin; i<=window.board.maxPin; i++) {
        pinFeatures[i] = [];
    }
    for (var feature in config) {
        if (config.hasOwnProperty(feature)) {
            for (var j=0; j<config[feature].configurations.length; j++) {
                var pins = config[feature].configurations[j].pins;
                for (p=0; p<pins.length; p++) {
                    pinFeatures[pins[p]].push(feature);
                }
            }
        }
    }
    
    container = $("#board");
    for (var i=window.board.minPin; i<=window.board.maxPin; i++) {
        child = $("<div></div>");
        child.text(i).addClass("pin pin-"+i);
        child.data("pin", i);
        child.appendTo(container);
        child.droppable({
            accept: function(draggableElement) {
                var thisPin = $(this).data("pin"),
                    thisFeature = draggableElement.data("feature"),
                    acceptable = pinFeatures[thisPin];
                    
                return acceptable.indexOf(thisFeature) != -1;
            },
            activeClass: "ui-state-default",
            hoverClass: "ui-state-hover",
            tolerance: "pointer",
            drop: function( event, ui ) {
                var thisFeature = ui.draggable.data("feature"),
                    thisPin = $(this).data("pin"),
                    configurations = config[thisFeature].configurations,
                    configuration;
                
                // lookup for the desired pin configuration
                for (var j=0; j<configurations.length; j++) {
                    var pins = configurations[j].pins;
                    for (p=0; p<pins.length; p++) {
                        if (pins[p] == thisPin) {
                            configuration = pins;
                        }
                    }
                }
                
                // are all the pins of this configuration free?
                var pinBusy, configAvailable = true;
                for (p=0; p<configuration.length; p++) {
                    pinBusy = $(".pin-" + configuration[p]).hasClass("pin-busy");
                    if (pinBusy) {
                        configAvailable = false;
                    }
                }
                
                if (!configAvailable) {
                    alert("Cannot overlap pinmuxing! To remove a feature right-click it.");
                    return false;
                }
                
                // mark pins as busy
                for (p=0; p<configuration.length; p++) {
                    $(".pin-" + configuration[p])
                    .text(ui.draggable.data("feature"))
                    .attr("title", ui.draggable.data("feature"))
                    .addClass("pin-busy");
                }
            }
        });
    }
};

function getUsedPins()
{
    var pins = [], pin;
    
    for (var i=0; i<=window.board.maxPin; i++) {
        pin = $(".pin-" + i);
        if (pin.hasClass("pin-busy")) {
            pins.push(pin.data("pin"));
        }
    }

    return pins;
}

function dumpConfiguration()
{
    var devices = {}, pin, name;
    
    for (var i=0; i<=window.board.maxPin; i++) {
        pin = $(".pin-" + i);
        if (pin.hasClass("pin-busy")) {
            name = pin.text();
            if (name == '1wire') {
                name = "onewire" + pin.data("pin");
            }
            if (!devices[name]) {
                devices[name] = [];
            }
            
            devices[name].push(pin.data("pin"));
            
            if (board.features[name] && board.features[name].depends && board.features[name].depends instanceof Array) {
                for (var d=0; d<board.features[name].depends.length; d++) {
                    var depend = board.features[name].depends[d];
                    devices[depend] = [];
                }
            }
        }
    }

    return devices;
}

function applyConfiguration(devices)
{
    for (var device in devices) {
        if (devices.hasOwnProperty(device)) {
            var configuration = devices[device], devname = device;
            
            if (device.substr(0, 7) == 'onewire') {
                devname = '1wire';
            }
            
            for (p=0; p<configuration.length; p++) {
                $(".pin-" + configuration[p])
                .text(devname)
                .addClass("pin-busy");
            }
        }
    }
}

function resetConfiguration()
{
    for (var i=0; i<=window.board.maxPin; i++) {
        $(".pin-" + i).text(i).attr("title", "").removeClass("pin-busy");
    }
    
    applyConfiguration(JSON.parse(board.defconfig));
}

function saveConfiguration()
{
    $("body").mask("Please, wait...");
    $.ajax("/save", {
        data: {
            id: window.board.id,
            conf: JSON.stringify(dumpConfiguration())
        },
        method: 'POST',
        success: function(response) {
            $("body").unmask();
            
            if (response.success) {
                var html = [
                    "Device tree built!",
                    "<br>",
                    "Reboot your board to apply the changes."
                ];
                if (window.board.id == 'qdl') {
                    html.push("<br><br><span class=\"label label-warning\">WARNING!</span> ");
                    html.push("Non-GPIO pins (" + getUsedPins().join(", ") + ") ");
                    html.push("<b>must</b> be configured with <code>pinMode(pin, INPUT);</code> in the Arduino sketch!");
                }
                $('#modal-msg').html(html.join(''));
                $('.modal').modal('show');
            } else {
                $('#modal-msg').html("Error: " + (response.message||"unknown error."));
                $('.modal').modal('show');
            }
        },
        error: function() {
            $("body").unmask();
            $('#modal-msg').html("Could not build DTB.");
            $('.modal').modal('show');
        }
    });
}

$(function() {
    $.material.init();
    
    $(document).contextmenu({
        delegate: ".pin",
        autoFocus: true,
        preventContextMenuForPopup: true,
        preventSelect: true,
        taphold: true,
        menu: [
            {title: "Remove", cmd: "remove", uiIcon: "ui-icon-scissors"}
        ],
        select: function(event, ui) {
            var thisFeature = ui.target.text(),
                thisPin = ui.target.data("pin"),
                configurations = window.board.features[thisFeature].configurations,
                configuration;
            
            // lookup for the desired pin configuration
            for (var j=0; j<configurations.length; j++) {
                var pins = configurations[j].pins;
                for (p=0; p<pins.length; p++) {
                    if (pins[p] == thisPin) {
                        configuration = pins;
                    }
                }
            }
            
            // mark pins as free
            for (p=0; p<configuration.length; p++) {
                $(".pin-" + configuration[p])
                .text(configuration[p])
                .attr("title", "")
                .removeClass("pin-busy");
            }
            
        },
        beforeOpen: function(event, ui) {
            ui.menu.zIndex( $(event.target).zIndex() + 1);
            $(document).contextmenu("enableEntry", "remove", ui.target.hasClass("pin-busy"));
        }
    });
    
    $('.board-name').html(window.board.name);
    initBoard(window.board.features);
    
    $('#reset-btn').on('click', resetConfiguration);
    $('#save-btn').on('click', saveConfiguration);
});
