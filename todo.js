;(function() {

  // polyfill the function prototype
  var EXTEND = Function.prototype.extend || function(that, augmentations) {
    for (prop in augmentations) {
      if (augmentations.hasOwnProperty(prop)) {
        that.prototype[prop] = augmentations[prop];
      }
    }
  }


  PubSub = {
    _events: {},
    publish: function(eventname, data) {
      if (PubSub._events[eventname]) {
        var events = PubSub._events[eventname].slice(0);
        events.forEach(function(eventdata) {
          eventdata['callback'].call(eventdata.scope, data);
        });
      }
    },
    subscribe: function(eventname, callback, scope) {
      if (!PubSub._events[eventname]) {
        PubSub._events[eventname] = [ ];
      }
      PubSub._events[eventname].push({ 'callback': callback, 'scope': scope });
    }
  };

  // to interact with the HTML through the DOM
  function TodoView(model) {
    this._model = model;
  }
  
  EXTEND(TodoView, function() {
    var ENTER = '13';

    return {
      initialize: function() {
        this._text = document.getElementById('text');
        this._button = document.getElementById('button');
        this._list = document.getElementById('todos');
        this._addListeners();
      },
      createTodo: function(todo) {
        var li = document.createElement('li');
        li.className =  'todo' + (todo.status==="checked" ? ' checked' : '');
        li.innerHTML =  '<input id="'+todo.id+'" type="checkbox" ' + 
        (todo.status==="checked"?'checked="checked" disabled="disabled"':'') + 
        ' />' +
        '<label for="'+todo.id+'">'+todo.text+'</label>';
        this._list.appendChild(li);
        var el = document.getElementById(todo.id)
        el && el.addEventListener('change', this._getCallbackFunction('_checked'));
      },
      editTodo: function(id) {
        var el = document.getElementById(id);
        var clazz = el.parentNode.className;
        if (el.checked) {
          el.setAttribute('disabled', 'disabled');
          el.parentNode.className = clazz + ' checked';
        }
      },
      textEntered: function() {
        this._model.create(encodeURIComponent(this._text.value));
      },
      _getCallbackFunction: function(name) {
        var me = this;
        return function(event) { me[name].call(me, event); };
      },
      _addListeners: function() {
        // subsribers 
        PubSub.subscribe('todos-recieved-inmodel', function() {
          this._todos = this._model.get();
          this._todos.forEach(this.createTodo, this);
        }, this);
        PubSub.subscribe('todo-created-inmodel', this.createTodo, this);
        PubSub.subscribe('todo-edited-inmodel', this.editTodo, this);
        
        // dom events 
        this._text.addEventListener('keyup', this._getCallbackFunction('_keyup'));
        this._text.addEventListener('focus', this._getCallbackFunction('_focus'));
        this._text.addEventListener('blur', this._getCallbackFunction('_blur'));

        this._button.addEventListener('click', this._getCallbackFunction('_click'));
      },
      _keyup: function(event) {
        if (event.keyCode == ENTER) {
          event.preventDefault();
          this.textEntered();
        }
      },
      _click: function(event) {
        event.preventDefault();
        this.textEntered();
      },
      _checked: function(event) {
        var target = event.target || event.srcElement;
        var id = target.id;
        this._model.edit(id);
      }
    };
  }());

  // to store the state of the page
  function todoModel(service) {
    this.initialize(service);
  }
  var CREATED = 'todo-created';
  var RECIEVED = 'todos-recieved';
  var EDITED = 'todo-edited';
  EXTEND(todoModel, {
    default: {
      text: "What would you want to do?"
    },
    initialize: function(service) {
      this._todos = [];
      this._service = service;
      PubSub.subscribe(CREATED, this._onTodoCreated, this);
      PubSub.subscribe(RECIEVED, this._onTodosRecieved, this)
      PubSub.subscribe(EDITED, this._onTodoEdited, this)
      this._service.get('', RECIEVED);
    },
    get: function() {
      return this._todos;
    },
    create: function(text) {
      this._text = text;
      this._service.post('/create', { 'text': text, 'status': '' }, CREATED);
    },
    edit: function(id) {
      this._id = id;
      this._service.post('/'+id+'/edit', {'id': id, 'status': 'checked'}, EDITED)
    },
    _onTodosRecieved: function(response) {
      if (response.success) {
        this._todos = response.data;
        PubSub.publish(RECIEVED+'-inmodel', response.data);
      }
    },
    _onTodoCreated: function(response) {
      if (response.success) {
        this._todos[parseInt(response.data.id)] = response.data;
        PubSub.publish(CREATED+'-inmodel', response.data);
      }
    },
    _onTodoEdited: function(response) {
      if (response.success) {
        this._todos[parseInt(response.data.id)].status = 'checked';
        PubSub.publish(EDITED+'-inmodel', response.data.id);
      }
    }
  });

  // to fetch information from the server
  function todoService(urlbase) {
    this._urlBase = urlbase;
  }

  EXTEND(todoService, {
    get: function(url, eventname) {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", this._urlBase+url, true);
      xhr.onload = this.success(xhr, eventname);
      xhr.onerror = this.failure(eventname);
      xhr.send();
    },
    post: function(url, data, eventname) {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", this._urlBase+url, true);
      xhr.setRequestHeader("content-type", "application/json");
      xhr.onload = this.success(xhr, eventname);
      xhr.onerror = this.failure(eventname, data);
      xhr.send(JSON.stringify(data));
    },
    success: function(xhr, eventname) {
      return function() {
        if (xhr.readyState === 4 && xhr.status === 200) {
          PubSub.publish(eventname, {'success': true, 'eventname': eventname, 'data': JSON.parse(xhr.responseText)});
        }
      }
    },
    failure: function(eventname, data) {
      return function() {
        console.error("Error retrieving the information!");
        PubSub.publish(eventname, {'success': false, 'eventname': eventname, 'data': data});
      }
    }
  });

  var service = new todoService('http://localhost:9898/todo/tasks');
  var model = new todoModel(service);
  window.TODO = new TodoView(model);
  
})();
