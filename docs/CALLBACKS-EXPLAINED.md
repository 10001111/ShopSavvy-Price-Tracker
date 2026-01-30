# 📞 What is a Callback?

## Simple Definition

**A callback is a function that you pass to another function, and it gets called (executed) later.**

Think of it like:
- 📞 Giving your phone number to a restaurant
- ⏰ Setting an alarm clock
- 📦 Leaving delivery instructions

## Real-Life Analogy

### Ordering Pizza 🍕

**Without Callback:**
```
You: "I want a pizza"
Employee: "OK, wait here for 30 minutes"
*You stand there waiting...*
Employee: "Here's your pizza"
```

**With Callback:**
```
You: "I want a pizza. Here's my number (callback), call me when ready"
Employee: "OK!"
*You go do other things...*
*30 minutes later...*
Employee: *Calls your number* ← This is the CALLBACK!
You: "Great! I'll come pick it up"
```

---

## Code Examples

### Example 1: Basic Callback

```javascript
// This is a function that TAKES a callback
function doHomework(subject, callback) {
  console.log(`Starting my ${subject} homework...`);
  callback(); // ← Execute the callback when done
}

// This is the CALLBACK function
function finishedHomework() {
  console.log("Finished homework!");
}

// Using it
doHomework("math", finishedHomework);
```

**Output:**
```
Starting my math homework...
Finished homework!
```

---

### Example 2: Callbacks with Parameters

```javascript
function bakeCake(flavor, whenDone) {
  console.log(`Baking a ${flavor} cake...`);
  
  // Simulate baking time
  setTimeout(() => {
    const cake = `Delicious ${flavor} cake`;
    whenDone(cake); // ← Pass the result to callback
  }, 2000);
}

// Use it
bakeCake("chocolate", function(result) {
  console.log(`Done! ${result} is ready!`);
});
```

---

### Example 3: Success and Error Callbacks

```javascript
function downloadFile(filename, onSuccess, onError) {
  console.log(`Downloading ${filename}...`);
  
  setTimeout(() => {
    const success = Math.random() > 0.5; // 50% chance
    
    if (success) {
      onSuccess("Download complete!"); // ← Success callback
    } else {
      onError("Download failed!"); // ← Error callback
    }
  }, 1000);
}

// Use it
downloadFile(
  "document.pdf",
  // Success callback
  function(message) {
    console.log("✓", message);
  },
  // Error callback
  function(error) {
    console.log("✗", error);
  }
);
```

---

## Where Are Callbacks Used?

### 1. **Array Methods** (Built into JavaScript)

```javascript
const numbers = [1, 2, 3, 4, 5];

// forEach - execute callback for each item
numbers.forEach(function(number) {
  console.log(number);
});

// map - transform each item using callback
const doubled = numbers.map(function(number) {
  return number * 2;
});
console.log(doubled); // [2, 4, 6, 8, 10]

// filter - keep items where callback returns true
const evens = numbers.filter(function(number) {
  return number % 2 === 0;
});
console.log(evens); // [2, 4]
```

### 2. **Event Listeners**

```javascript
button.addEventListener("click", function() {
  console.log("Button clicked!"); // ← This is a callback
});
```

### 3. **Timers**

```javascript
setTimeout(function() {
  console.log("Hello after 2 seconds"); // ← Callback
}, 2000);
```

### 4. **Reading Files**

```javascript
fs.readFile("data.txt", function(error, data) {
  if (error) {
    console.log("Error:", error);
  } else {
    console.log("File content:", data); // ← Callback
  }
});
```

---

## In Your OfertaRadar Project

### Where We Use Callbacks:

1. **Email Sending** (`sendVerificationEmail`)
   ```javascript
   sendVerificationEmail(
     email,
     link,
     function(info) { // ← Success callback
       console.log("Email sent!");
     },
     function(error) { // ← Error callback
       console.log("Failed:", error);
     }
   );
   ```

2. **Database Queries**
   ```javascript
   db.get("SELECT * FROM users", function(error, user) {
     if (error) {
       console.log("Database error");
     } else {
       console.log("Found user:", user);
     }
   });
   ```

3. **HTTP Requests**
   ```javascript
   fetch(apiUrl).then(function(response) { // ← Callback
     return response.json();
   });
   ```

---

## Common Problems with Callbacks

### ❌ Callback Hell (Pyramid of Doom)

When you nest too many callbacks:

```javascript
doSomething(function() {
  doSomethingElse(function() {
    doAnotherThing(function() {
      doFinalThing(function() {
        console.log("Done!");
      });
    });
  });
});
```

**Hard to read and maintain!**

### ✅ Modern Solutions

**Promises:**
```javascript
doSomething()
  .then(doSomethingElse)
  .then(doAnotherThing)
  .then(doFinalThing)
  .then(() => console.log("Done!"));
```

**Async/Await:**
```javascript
async function doAll() {
  await doSomething();
  await doSomethingElse();
  await doAnotherThing();
  await doFinalThing();
  console.log("Done!");
}
```

---

## Key Points to Remember

✅ **Callback** = A function passed as an argument  
✅ **Asynchronous** = Things that take time (network, files, timers)  
✅ **Execute Later** = The callback runs when the task finishes  
✅ **Two Types**: Success callbacks and error callbacks  
✅ **Modern Alternative**: Promises and async/await  

---

## Try It Yourself!

Run the demo file to see callbacks in action:

```bash
node src/callbacks-demo.js
```

This will show you 6 different callback examples with output!

---

## Questions?

- **Q: When should I use callbacks?**  
  A: When you need to wait for something to finish (API calls, file reading, timers)

- **Q: Are callbacks still used?**  
  A: Yes! Especially in event listeners and array methods. But for async operations, Promises/async-await are preferred.

- **Q: What's the difference between callback and return?**  
  A: `return` gives back a value immediately. Callbacks are for things that take time.

---

Happy coding! 🚀
