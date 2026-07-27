let todoList = [];

const todoInput = document.getElementById('todo-input');
const addTodoButton = document.getElementById('add-todo');
const todoListElement = document.getElementById('todo-list');

addTodoButton.addEventListener('click', addTodo);

todoInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addTodo();
    }
});

function addTodo() {
    const todoText = todoInput.value.trim();
    if (todoText !== '') {
        todoList.push(todoText);
        todoInput.value = '';
        renderTodoList();
    }
}

function renderTodoList() {
    todoListElement.innerHTML = '';
    todoList.forEach((todo, index) => {
        const todoElement = document.createElement('li');
        todoElement.textContent = todo;
        todoListElement.appendChild(todoElement);
    });
}