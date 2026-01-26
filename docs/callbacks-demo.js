/**
 * CALLBACKS DEMONSTRATION
 * 
 * A callback is a function passed as an argument to another function.
 * The callback function is executed after the main function completes its task.
 * 
 * Think of it like ordering food at a restaurant:
 * 1. You place your order (call a function)
 * 2. You give your phone number (provide a callback)
 * 3. The kitchen prepares food (function does its work)
 * 4. They call you when ready (callback is executed)
 */

// ============================================
// EXAMPLE 1: Simple Callback (Synchronous)
// ============================================

function greetUser(name, callback) {
  console.log(`Hello, ${name}!`);
  // After greeting, execute the callback
  callback();
}

function sayGoodbye() {
  console.log("Goodbye! Have a great day!");
}

// Using the callback
console.log("=== Example 1: Simple Callback ===");
greetUser("Alice", sayGoodbye);
// Output:
// Hello, Alice!
// Goodbye! Have a great day!

console.log("\n");

// ============================================
// EXAMPLE 2: Callback with Parameters
// ============================================

function calculateSum(a, b, onComplete) {
  const result = a + b;
  // Pass the result to the callback
  onComplete(result);
}

console.log("=== Example 2: Callback with Parameters ===");
calculateSum(5, 10, function(sum) {
  console.log(`The sum is: ${sum}`);
});
// Output: The sum is: 15

console.log("\n");

// ============================================
// EXAMPLE 3: Asynchronous Callback (Real-world)
// ============================================

function fetchUserData(userId, onSuccess, onError) {
  console.log(`Fetching data for user ${userId}...`);
  
  // Simulate network delay with setTimeout
  setTimeout(() => {
    // Simulate random success/failure
    const success = Math.random() > 0.3;
    
    if (success) {
      const userData = {
        id: userId,
        name: "John Doe",
        email: "john@example.com"
      };
      onSuccess(userData); // Call success callback
    } else {
      onError("Network error occurred"); // Call error callback
    }
  }, 2000); // 2 second delay
}

console.log("=== Example 3: Asynchronous Callback ===");
fetchUserData(
  123,
  // Success callback
  function(data) {
    console.log("✓ User data received:");
    console.log(data);
  },
  // Error callback
  function(error) {
    console.log("✗ Error:", error);
  }
);

// ============================================
// EXAMPLE 4: Callback in Array Methods
// ============================================

console.log("\n=== Example 4: Array Methods Use Callbacks ===");

const numbers = [1, 2, 3, 4, 5];

// forEach - executes callback for each element
numbers.forEach(function(number) {
  console.log(`Number: ${number}`);
});

// map - transforms array using callback
const doubled = numbers.map(function(number) {
  return number * 2;
});
console.log("Doubled:", doubled);

// filter - filters array using callback
const evenNumbers = numbers.filter(function(number) {
  return number % 2 === 0;
});
console.log("Even numbers:", evenNumbers);

// ============================================
// EXAMPLE 5: Real ShopSavvy Use Case
// ============================================

function searchProducts(query, onSuccess, onError) {
  console.log(`\n=== Example 5: Product Search with Callbacks ===`);
  console.log(`Searching for: ${query}`);
  
  // Simulate API call
  setTimeout(() => {
    if (!query) {
      onError("Query cannot be empty");
      return;
    }
    
    const products = [
      { id: 1, name: "Laptop", price: 999 },
      { id: 2, name: "Phone", price: 599 },
      { id: 3, name: "Tablet", price: 399 }
    ];
    
    const results = products.filter(p => 
      p.name.toLowerCase().includes(query.toLowerCase())
    );
    
    onSuccess(results);
  }, 1000);
}

// Using the product search
searchProducts(
  "laptop",
  // Success callback
  function(products) {
    console.log(`✓ Found ${products.length} products:`);
    products.forEach(p => {
      console.log(`  - ${p.name}: $${p.price}`);
    });
  },
  // Error callback
  function(error) {
    console.log(`✗ Error: ${error}`);
  }
);

// ============================================
// EXAMPLE 6: Callback Hell (The Problem!)
// ============================================

console.log("\n=== Example 6: Callback Hell ===");

// This is what we want to AVOID!
function step1(callback) {
  setTimeout(() => {
    console.log("Step 1 complete");
    callback();
  }, 500);
}

function step2(callback) {
  setTimeout(() => {
    console.log("Step 2 complete");
    callback();
  }, 500);
}

function step3(callback) {
  setTimeout(() => {
    console.log("Step 3 complete");
    callback();
  }, 500);
}

// Nested callbacks (hard to read!)
step1(function() {
  step2(function() {
    step3(function() {
      console.log("All steps complete!");
    });
  });
});

// ============================================
// MODERN ALTERNATIVE: Promises (Better!)
// ============================================

console.log("\n=== Modern Alternative: Promises ===");

function fetchUserWithPromise(userId) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const success = true;
      if (success) {
        resolve({ id: userId, name: "Jane" });
      } else {
        reject("Error occurred");
      }
    }, 1000);
  });
}

// Much cleaner than callbacks!
fetchUserWithPromise(456)
  .then(data => {
    console.log("✓ User data:", data);
  })
  .catch(error => {
    console.log("✗ Error:", error);
  });

// ============================================
// EVEN BETTER: Async/Await (Modern)
// ============================================

console.log("\n=== Even Better: Async/Await ===");

async function getUserData(userId) {
  try {
    const data = await fetchUserWithPromise(userId);
    console.log("✓ User data (async/await):", data);
  } catch (error) {
    console.log("✗ Error:", error);
  }
}

getUserData(789);

/**
 * KEY TAKEAWAYS:
 * 
 * 1. Callbacks are functions passed as arguments
 * 2. They execute AFTER the main function completes
 * 3. Used heavily in asynchronous operations (file I/O, network, timers)
 * 4. Can lead to "callback hell" if nested too deeply
 * 5. Modern alternatives: Promises and async/await
 * 
 * WHEN TO USE CALLBACKS:
 * - Event listeners (button clicks, etc.)
 * - Array methods (map, filter, forEach)
 * - Asynchronous operations (reading files, API calls)
 * - Custom utility functions
 */
