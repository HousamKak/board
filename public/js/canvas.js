/**
 * Canvas management module for the collaboration board
 * @module canvas
 */

class CanvasManager {
  /**
   * Create a CanvasManager instance
   */
  constructor() {
    this.canvas = null;
    this.container = document.querySelector('.canvas-container');
    this.currentTool = 'select';
    this.selectedObjects = [];
    this.isDrawing = false;
    this.drawingObject = null;
    this.connectorStart = null;
    this.zoom = 1;
    this.elements = new Map();
    this.contextMenu = document.getElementById('contextMenu');
    this.currentContextObject = null;
    this.isPanning = false;
    this.panStart = null;
    
    this.initializeCanvas();
    this.initializeEventListeners();
  }

  /**
   * Initialize Fabric.js canvas
   */
  initializeCanvas() {
    const canvasElement = document.getElementById('mainCanvas');
    this.canvas = new fabric.Canvas(canvasElement, {
      width: window.innerWidth,
      height: window.innerHeight - 50,
      backgroundColor: '#f8f9fa'
    });

    // Enable object selection and multi-touch
    this.canvas.selection = true;
    this.canvas.uniformScaling = false;
    
    // Add infinite canvas behavior
    this.setupInfiniteCanvas();
  }

  /**
   * Setup infinite canvas with zoom and pan
   */
  setupInfiniteCanvas() {
    // Pan functionality
    this.canvas.on('mouse:down', (opt) => {
      const evt = opt.e;
      if (this.currentTool === 'pan' || evt.shiftKey || evt.which === 2) {
        this.isPanning = true;
        this.canvas.isDragging = true;
        this.canvas.selection = false;
        this.panStart = { x: evt.clientX, y: evt.clientY };
      }
    });

    this.canvas.on('mouse:move', (opt) => {
      if (this.isPanning && this.panStart) {
        const e = opt.e;
        const zoom = this.canvas.getZoom();
        const vpt = this.canvas.viewportTransform;
        vpt[4] += e.clientX - this.panStart.x;
        vpt[5] += e.clientY - this.panStart.y;
        this.canvas.requestRenderAll();
        this.panStart = { x: e.clientX, y: e.clientY };
      }
    });

    this.canvas.on('mouse:up', () => {
      this.isPanning = false;
      this.panStart = null;
      this.canvas.isDragging = false;
      this.canvas.selection = true;
    });

    // Zoom functionality
    this.canvas.on('mouse:wheel', (opt) => {
      const delta = opt.e.deltaY;
      let zoom = this.canvas.getZoom();
      zoom *= 0.999 ** delta;
      if (zoom > 5) zoom = 5;
      if (zoom < 0.1) zoom = 0.1;
      this.canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
      opt.e.preventDefault();
      opt.e.stopPropagation();
      this.updateZoomLevel();
    });
  }

  /**
   * Initialize event listeners
   */
  initializeEventListeners() {
    // Window resize
    window.addEventListener('resize', () => this.resizeCanvas());

    // Tool selection
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.setTool(e.currentTarget.dataset.tool));
    });

    // Zoom controls
    document.getElementById('zoomInBtn').addEventListener('click', () => this.zoomIn());
    document.getElementById('zoomOutBtn').addEventListener('click', () => this.zoomOut());
    document.getElementById('resetZoomBtn').addEventListener('click', () => this.resetZoom());

    // Canvas events
    this.canvas.on('mouse:down', (options) => this.handleMouseDown(options));
    this.canvas.on('mouse:move', (options) => this.handleMouseMove(options));
    this.canvas.on('mouse:up', (options) => this.handleMouseUp(options));
    this.canvas.on('selection:created', (options) => this.handleSelectionCreated(options));
    this.canvas.on('selection:updated', (options) => this.handleSelectionUpdated(options));
    this.canvas.on('selection:cleared', () => this.handleSelectionCleared());
    this.canvas.on('object:modified', (options) => this.handleObjectModified(options));

    // Right-click context menu
    this.canvas.on('mouse:down', (options) => {
      if (options.e.which === 3) {
        this.handleRightClick(options.e, options.target);
      }
    });

    // Context menu actions
    this.contextMenu.addEventListener('click', (e) => {
      if (e.target.tagName === 'LI') {
        this.handleContextMenuAction(e.target.dataset.action);
      }
    });

    // Modal handlers
    document.querySelectorAll('.cancel-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modalId = e.target.dataset.modal;
        document.getElementById(modalId).style.display = 'none';
      });
    });

    // Hide modals when clicking outside
    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
      }
    });

    // Task form submission
    document.getElementById('taskForm').addEventListener('submit', (e) => this.handleTaskFormSubmit(e));

    // Color picker
    document.querySelectorAll('.color-option').forEach(option => {
      option.addEventListener('click', (e) => this.handleColorSelection(e.target.dataset.color));
    });

    // Socket event handlers
    window.socketManager.on('element-created', (element) => this.handleRemoteElementCreated(element));
    window.socketManager.on('element-updated', (element) => this.handleRemoteElementUpdated(element));
    window.socketManager.on('element-deleted', (elementId) => this.handleRemoteElementDeleted(elementId));
    window.socketManager.on('load-elements', (elements) => this.loadElements(elements));
  }

  /**
   * Set current tool
   * @param {string} tool - Tool name
   */
  setTool(tool) {
    this.currentTool = tool;
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });
    
    // Update cursor
    switch (tool) {
      case 'select':
        this.canvas.hoverCursor = 'default';
        this.canvas.defaultCursor = 'default';
        this.canvas.selection = true;
        break;
      case 'pan':
        this.canvas.hoverCursor = 'move';
        this.canvas.defaultCursor = 'move';
        this.canvas.selection = false;
        break;
      case 'sticky':
      case 'task':
        this.canvas.hoverCursor = 'crosshair';
        this.canvas.defaultCursor = 'crosshair';
        this.canvas.selection = false;
        break;
      case 'connector':
        this.canvas.hoverCursor = 'crosshair';
        this.canvas.defaultCursor = 'alias';
        this.canvas.selection = false;
        break;
    }
  }

  /**
   * Handle mouse down events
   * @param {Object} options - Event options
   */
  handleMouseDown(options) {
    if (this.currentTool === 'sticky' || this.currentTool === 'task') {
      // Only create elements when clicking on empty space
      if (!options.target) {
        const pointer = this.canvas.getPointer(options.e);
        this.createElement(this.currentTool, pointer);
      }
    } else if (this.currentTool === 'connector' && options.target) {
      this.connectorStart = options.target;
      this.isDrawing = true;
      
      const pointer = this.canvas.getPointer(options.e);
      const startPoint = this.getElementCenter(options.target);
      
      this.drawingObject = new fabric.Line([startPoint.x, startPoint.y, pointer.x, pointer.y], {
        stroke: '#4a5568',
        strokeWidth: 2,
        selectable: false,
        evented: false
      });
      
      this.canvas.add(this.drawingObject);
    }
  }

  /**
   * Handle mouse move events
   * @param {Object} options - Event options
   */
  handleMouseMove(options) {
    const pointer = this.canvas.getPointer(options.e);
    
    // Emit cursor position
    window.socketManager.emitCursorMove(pointer);

    if (this.isDrawing && this.drawingObject && this.currentTool === 'connector') {
      this.drawingObject.set({ x2: pointer.x, y2: pointer.y });
      this.canvas.renderAll();
    }
  }

  /**
   * Handle mouse up events
   * @param {Object} options - Event options
   */
  handleMouseUp(options) {
    if (this.currentTool === 'connector' && this.isDrawing) {
      this.finishConnector(options.target);
    }
    
    this.isDrawing = false;
  }

  /**
   * Create a new element
   * @param {string} type - Element type
   * @param {Object} position - Position
   */
  createElement(type, position) {
    let element;
    const id = 'element_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    if (type === 'sticky') {
      element = new fabric.Textbox('Click to edit', {
        left: position.x,
        top: position.y,
        width: 200,
        height: 150,
        backgroundColor: '#fff2cc',
        borderRadius: 8,
        padding: 16,
        fontSize: 16,
        fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif',
        fill: '#333',
        hasControls: true,
        hasBorders: true,
        lockScalingX: true,
        lockScalingY: true,
        splitByGrapheme: true,
        editable: true,
        shadow: {
          color: 'rgba(0,0,0,0.1)',
          blur: 8,
          offsetX: 2,
          offsetY: 2
        },
        data: {
          id: id,
          type: 'sticky',
          content: {
            text: 'Click to edit'
          }
        }
      });
    } else if (type === 'task') {
      element = this.createTaskCard(id, position);
    }

    this.canvas.add(element);
    this.canvas.setActiveObject(element);
    this.canvas.renderAll();

    // Emit element creation
    this.emitElementCreate(element);
    this.elements.set(id, element);
    
    // Automatically switch to select tool after creating an element
    this.setTool('select');
  }

  /**
   * Create task card
   * @param {string} id - Element ID
   * @param {Object} position - Position
   * @returns {fabric.Group} Task card group
   */
  createTaskCard(id, position) {
    const rect = new fabric.Rect({
      width: 280,
      height: 140,
      fill: '#ffffff',
      stroke: '#e2e8f0',
      strokeWidth: 1,
      rx: 12,
      ry: 12,
      shadow: {
        color: 'rgba(0,0,0,0.1)',
        blur: 8,
        offsetX: 2,
        offsetY: 2
      }
    });

    const title = new fabric.Text('Task Title', {
      left: 15,
      top: 15,
      width: 250,
      fontSize: 18,
      fontWeight: '600',
      fill: '#1a202c',
      fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif'
    });

    const description = new fabric.Text('Click to edit description', {
      left: 15,
      top: 45,
      width: 250,
      fontSize: 14,
      fill: '#4a5568',
      fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif'
    });

    const status = new fabric.Text('To Do', {
      left: 15,
      top: 100,
      fontSize: 12,
      fill: '#dc2626',
      backgroundColor: '#fee2e2',
      padding: 4,
      borderRadius: 16,
      fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif'
    });

    const taskGroup = new fabric.Group([rect, title, description, status], {
      left: position.x,
      top: position.y,
      lockScalingX: true,
      lockScalingY: true,
      data: {
        id: id,
        type: 'task',
        content: {
          title: 'Task Title',
          description: 'Click to edit description',
          status: 'todo',
          assignee: '',
          dueDate: null
        }
      }
    });

    return taskGroup;
  }

  /**
   * Finish creating a connector
   * @param {fabric.Object} target - Target object
   */
  finishConnector(target) {
    if (this.connectorStart && target && this.connectorStart !== target) {
      const startPoint = this.getElementCenter(this.connectorStart);
      const endPoint = this.getElementCenter(target);
      
      const connector = this.createConnector(this.connectorStart.data?.id, target.data?.id, startPoint, endPoint);
      this.canvas.add(connector);
      this.canvas.sendToBack(connector);
      
      // Emit connector creation
      this.emitConnectorCreate(connector);
      this.elements.set(connector.data.id, connector);
    }
    
    if (this.drawingObject) {
      this.canvas.remove(this.drawingObject);
      this.drawingObject = null;
    }
    this.connectorStart = null;
  }

  /**
   * Create a connector line
   * @param {string} fromId - Source element ID
   * @param {string} toId - Target element ID
   * @param {Object} start - Start point
   * @param {Object} end - End point
   * @returns {fabric.Line} Connector line
   */
  createConnector(fromId, toId, start, end) {
    const id = 'connector_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    const line = new fabric.Line([start.x, start.y, end.x, end.y], {
      stroke: '#4a5568',
      strokeWidth: 2,
      selectable: false,
      evented: false,
      data: {
        id: id,
        type: 'connector',
        fromElement: fromId,
        toElement: toId
      }
    });

    return line;
  }

  /**
   * Get center point of element
   * @param {fabric.Object} element - Fabric object
   * @returns {Object} Center point
   */
  getElementCenter(element) {
    const bound = element.getBoundingRect();
    return {
      x: bound.left + bound.width / 2,
      y: bound.top + bound.height / 2
    };
  }

  /**
   * Handle right click for context menu
   * @param {Event} e - Click event
   * @param {fabric.Object} target - Target object
   */
  handleRightClick(e, target) {
    e.preventDefault();
    
    if (target && (target.data?.type === 'sticky' || target.data?.type === 'task')) {
      this.currentContextObject = target;
      this.contextMenu.style.display = 'block';
      this.contextMenu.style.left = e.clientX + 'px';
      this.contextMenu.style.top = e.clientY + 'px';
    } else {
      this.contextMenu.style.display = 'none';
    }
  }

  /**
   * Handle context menu actions
   * @param {string} action - Action name
   */
  handleContextMenuAction(action) {
    if (!this.currentContextObject) return;

    switch (action) {
      case 'edit':
        this.editElement(this.currentContextObject);
        break;
      case 'color':
        this.showColorPicker();
        break;
      case 'delete':
        this.deleteElement(this.currentContextObject);
        break;
    }
    
    this.contextMenu.style.display = 'none';
    this.currentContextObject = null;
  }

  /**
   * Edit element
   * @param {fabric.Object} element - Element to edit
   */
  editElement(element) {
    if (element.data?.type === 'task') {
      this.showTaskEditor(element);
    } else if (element.data?.type === 'sticky') {
      element.enterEditing();
      element.selectAll();
    }
  }

  /**
   * Show task editor modal
   * @param {fabric.Object} task - Task object
   */
  showTaskEditor(task) {
    const modal = document.getElementById('taskEditorModal');
    const form = document.getElementById('taskForm');
    
    document.getElementById('taskId').value = task.data.id;
    document.getElementById('taskTitle').value = task.data.content.title;
    document.getElementById('taskDescription').value = task.data.content.description;
    document.getElementById('taskAssignee').value = task.data.content.assignee || '';
    document.getElementById('taskDueDate').value = task.data.content.dueDate || '';
    document.getElementById('taskStatus').value = task.data.content.status;
    
    modal.style.display = 'flex';
  }

  /**
   * Handle task form submission
   * @param {Event} e - Submit event
   */
  handleTaskFormSubmit(e) {
    e.preventDefault();
    
    const taskId = document.getElementById('taskId').value;
    const title = document.getElementById('taskTitle').value;
    const description = document.getElementById('taskDescription').value;
    const assignee = document.getElementById('taskAssignee').value;
    const dueDate = document.getElementById('taskDueDate').value;
    const status = document.getElementById('taskStatus').value;
    
    const element = this.elements.get(taskId);
    if (element) {
      // Update task content
      element.data.content = {
        title,
        description,
        status,
        assignee,
        dueDate
      };
      
      // Update visual elements
      const items = element.getObjects();
      items[1].set('text', title); // Title
      items[2].set('text', description); // Description
      items[3].set('text', this.getStatusText(status)); // Status
      items[3].set('fill', this.getStatusColor(status));
      items[3].set('backgroundColor', this.getStatusBgColor(status));
      
      this.canvas.renderAll();
      this.emitElementUpdate(element);
    }
    
    document.getElementById('taskEditorModal').style.display = 'none';
  }

  /**
   * Get status text
   * @param {string} status - Status code
   * @returns {string} Status text
   */
  getStatusText(status) {
    switch (status) {
      case 'todo': return 'To Do';
      case 'inprogress': return 'In Progress';
      case 'done': return 'Done';
      default: return status;
    }
  }

  /**
   * Get status color
   * @param {string} status - Status code
   * @returns {string} Color code
   */
  getStatusColor(status) {
    switch (status) {
      case 'todo': return '#dc2626';
      case 'inprogress': return '#d97706';
      case 'done': return '#059669';
      default: return '#4a5568';
    }
  }

  /**
   * Get status background color
   * @param {string} status - Status code
   * @returns {string} Background color code
   */
  getStatusBgColor(status) {
    switch (status) {
      case 'todo': return '#fee2e2';
      case 'inprogress': return '#fef3c7';
      case 'done': return '#d1fae5';
      default: return '#e2e8f0';
    }
  }

  /**
   * Show color picker
   */
  showColorPicker() {
    const modal = document.getElementById('colorPickerModal');
    modal.style.display = 'flex';
  }

  /**
   * Handle color selection
   * @param {string} color - Selected color
   */
  handleColorSelection(color) {
    if (this.currentContextObject && this.currentContextObject.data?.type === 'sticky') {
      this.currentContextObject.set('backgroundColor', color);
      this.canvas.renderAll();
      this.emitElementUpdate(this.currentContextObject);
    }
    document.getElementById('colorPickerModal').style.display = 'none';
  }

  /**
   * Delete element
   * @param {fabric.Object} element - Element to delete
   */
  deleteElement(element) {
    const elementId = element.data?.id;
    if (elementId) {
      this.canvas.remove(element);
      this.elements.delete(elementId);
      window.socketManager.deleteElement(elementId);
    }
  }

  /**
   * Emit element creation
   * @param {fabric.Object} element - Created element
   */
  emitElementCreate(element) {
    const elementData = this.serializeElement(element);
    window.socketManager.createElement(elementData);
  }

  /**
   * Emit element update
   * @param {fabric.Object} element - Updated element
   */
  emitElementUpdate(element) {
    const elementData = this.serializeElement(element);
    window.socketManager.updateElement(elementData);
  }

  /**
   * Emit connector creation
   * @param {fabric.Object} connector - Created connector
   */
  emitConnectorCreate(connector) {
    const connectorData = this.serializeConnector(connector);
    window.socketManager.createElement(connectorData);
  }

  /**
   * Serialize element for network transmission
   * @param {fabric.Object} element - Element to serialize
   * @returns {Object} Serialized element data
   */
  serializeElement(element) {
    return {
      id: element.data?.id,
      type: element.data?.type,
      content: element.data?.content,
      position: {
        left: element.left,
        top: element.top,
        width: element.width,
        height: element.height,
        scaleX: element.scaleX,
        scaleY: element.scaleY,
        angle: element.angle
      },
      style: {
        backgroundColor: element.backgroundColor,
        fill: element.fill,
        stroke: element.stroke,
        strokeWidth: element.strokeWidth
      }
    };
  }

  /**
   * Serialize connector for network transmission
   * @param {fabric.Object} connector - Connector to serialize
   * @returns {Object} Serialized connector data
   */
  serializeConnector(connector) {
    return {
      id: connector.data?.id,
      type: connector.data?.type,
      content: {
        fromElement: connector.data?.fromElement,
        toElement: connector.data?.toElement
      },
      position: {
        x1: connector.x1,
        y1: connector.y1,
        x2: connector.x2,
        y2: connector.y2
      },
      style: {
        stroke: connector.stroke,
        strokeWidth: connector.strokeWidth
      }
    };
  }

  /**
   * Handle remote element creation
   * @param {Object} elementData - Element data
   */
  handleRemoteElementCreated(elementData) {
    if (this.elements.has(elementData.id)) return;

    let element;
    if (elementData.type === 'sticky') {
      element = this.createRemoteStickyNote(elementData);
    } else if (elementData.type === 'task') {
      element = this.createRemoteTaskCard(elementData);
    } else if (elementData.type === 'connector') {
      element = this.createRemoteConnector(elementData);
    }

    if (element) {
      this.canvas.add(element);
      this.elements.set(elementData.id, element);
      this.canvas.renderAll();
    }
  }

  /**
   * Create remote sticky note
   * @param {Object} data - Element data
   * @returns {fabric.Textbox} Sticky note element
   */
  createRemoteStickyNote(data) {
    return new fabric.Textbox(data.content.text, {
      left: data.position.left,
      top: data.position.top,
      width: data.position.width,
      height: data.position.height,
      backgroundColor: data.style.backgroundColor || '#fff2cc',
      borderRadius: 8,
      padding: 16,
      fontSize: 16,
      fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif',
      fill: data.style.fill || '#333',
      shadow: {
        color: 'rgba(0,0,0,0.1)',
        blur: 8,
        offsetX: 2,
        offsetY: 2
      },
      data: {
        id: data.id,
        type: data.type,
        content: data.content
      }
    });
  }

  /**
   * Create remote task card
   * @param {Object} data - Element data
   * @returns {fabric.Group} Task card element
   */
  createRemoteTaskCard(data) {
    const rect = new fabric.Rect({
      width: 280,
      height: 140,
      fill: '#ffffff',
      stroke: '#e2e8f0',
      strokeWidth: 1,
      rx: 12,
      ry: 12,
      shadow: {
        color: 'rgba(0,0,0,0.1)',
        blur: 8,
        offsetX: 2,
        offsetY: 2
      }
    });

    const title = new fabric.Text(data.content.title, {
      left: 15,
      top: 15,
      width: 250,
      fontSize: 18,
      fontWeight: '600',
      fill: '#1a202c',
      fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif'
    });

    const description = new fabric.Text(data.content.description, {
      left: 15,
      top: 45,
      width: 250,
      fontSize: 14,
      fill: '#4a5568',
      fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif'
    });

    const status = new fabric.Text(this.getStatusText(data.content.status), {
      left: 15,
      top: 100,
      fontSize: 12,
      fill: this.getStatusColor(data.content.status),
      backgroundColor: this.getStatusBgColor(data.content.status),
      padding: 4,
      borderRadius: 16,
      fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif'
    });

    return new fabric.Group([rect, title, description, status], {
      left: data.position.left,
      top: data.position.top,
      data: {
        id: data.id,
        type: data.type,
        content: data.content
      }
    });
  }

  /**
   * Create remote connector
   * @param {Object} data - Connector data
   * @returns {fabric.Line} Connector element
   */
  createRemoteConnector(data) {
    return new fabric.Line([data.position.x1, data.position.y1, data.position.x2, data.position.y2], {
      stroke: data.style.stroke || '#4a5568',
      strokeWidth: data.style.strokeWidth || 2,
      selectable: false,
      evented: false,
      data: {
        id: data.id,
        type: data.type,
        fromElement: data.content.fromElement,
        toElement: data.content.toElement
      }
    });
  }

  /**
   * Handle remote element update
   * @param {Object} elementData - Updated element data
   */
  handleRemoteElementUpdated(elementData) {
    const element = this.elements.get(elementData.id);
    if (element && element !== this.canvas.getActiveObject()) {
      if (elementData.type === 'sticky') {
        element.text = elementData.content.text;
        element.set({
          left: elementData.position.left,
          top: elementData.position.top,
          backgroundColor: elementData.style.backgroundColor
        });
      } else if (elementData.type === 'task') {
        const items = element.getObjects();
        items[1].set('text', elementData.content.title);
        items[2].set('text', elementData.content.description);
        items[3].set('text', this.getStatusText(elementData.content.status));
        items[3].set('fill', this.getStatusColor(elementData.content.status));
        items[3].set('backgroundColor', this.getStatusBgColor(elementData.content.status));
        element.set({
          left: elementData.position.left,
          top: elementData.position.top
        });
        element.data.content = elementData.content;
      }
      this.canvas.renderAll();
    }
  }

  /**
   * Handle remote element deletion
   * @param {string} elementId - Element ID
   */
  handleRemoteElementDeleted(elementId) {
    const element = this.elements.get(elementId);
    if (element) {
      this.canvas.remove(element);
      this.elements.delete(elementId);
      this.canvas.renderAll();
    }
  }

  /**
   * Load elements from database
   * @param {Array} elements - Array of element data
   */
  loadElements(elements) {
    elements.forEach(elementData => {
      this.handleRemoteElementCreated(elementData);
    });
  }

  /**
   * Handle object selection
   * @param {Object} options - Selection options
   */
  handleSelectionCreated(options) {
    this.selectedObjects = this.canvas.getActiveObjects();
  }

  /**
   * Handle object selection update
   * @param {Object} options - Selection options
   */
  handleSelectionUpdated(options) {
    this.selectedObjects = this.canvas.getActiveObjects();
  }

  /**
   * Handle selection cleared
   */
  handleSelectionCleared() {
    this.selectedObjects = [];
  }

  /**
   * Handle object modification
   * @param {Object} options - Modification options
   */
  handleObjectModified(options) {
    const target = options.target;
    if (target && target.data?.id) {
      this.emitElementUpdate(target);
    }
  }

  /**
   * Resize canvas to window
   */
  resizeCanvas() {
    this.canvas.setDimensions({
      width: window.innerWidth,
      height: window.innerHeight - 50
    });
  }

  /**
   * Zoom in
   */
  zoomIn() {
    let zoom = this.canvas.getZoom();
    zoom = zoom * 1.1;
    if (zoom > 5) zoom = 5;
    this.canvas.setZoom(zoom);
    this.updateZoomLevel();
  }
  
  /**
   * Zoom out
   */
  zoomOut() {
    let zoom = this.canvas.getZoom();
    zoom = zoom / 1.1;
    if (zoom < 0.1) zoom = 0.1;
    this.canvas.setZoom(zoom);
    this.updateZoomLevel();
  }
  
  /**
   * Reset zoom
   */
  resetZoom() {
    this.canvas.setZoom(1);
    this.updateZoomLevel();
    this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    this.canvas.renderAll();
  }

  /**
   * Update zoom level display
   */
  updateZoomLevel() {
    const zoomLevel = Math.round(this.canvas.getZoom() * 100);
    document.getElementById('zoomLevel').textContent = `${zoomLevel}%`;
  }

  /**
   * Get canvas instance
   * @returns {fabric.Canvas} Canvas instance
   */
  getCanvas() {
    return this.canvas;
  }
}

// Create global canvas manager instance
window.canvasManager = new CanvasManager();