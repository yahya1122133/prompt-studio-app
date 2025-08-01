// Modern JavaScript Features Test & Usage Examples
// This file demonstrates the latest JS features available with your engine

/**
 * ES2024+ Features Available with Node.js 22+ / V8 12.4+
 */

// 1. Array.groupBy() - ES2024
export const groupData = (data, keyFn) => {
  if (Array.prototype.groupBy) {
    return data.groupBy(keyFn);
  }
  // Fallback for older engines
  return data.reduce((groups, item) => {
    const key = keyFn(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});
};

// 2. Promise.withResolvers() - ES2024
export const createDeferredPromise = () => {
  if (Promise.withResolvers) {
    return Promise.withResolvers();
  }
  // Fallback
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

// 3. String.prototype.isWellFormed() - ES2024
export const isValidUnicode = (str) => {
  return str.isWellFormed?.() ?? true; // Fallback to true for older engines
};

// 4. Temporal API (Stage 3) - Available in V8 12.4+
export const createModernDate = () => {
  try {
    if (typeof Temporal !== 'undefined') {
      return Temporal.Now.plainDateISO();
    }
  } catch (e) {
    // Fallback to regular Date
    return new Date().toISOString().split('T')[0];
  }
  return new Date().toISOString().split('T')[0];
};

// 5. Top-level await (already supported)
// Can be used in modules

// 6. Private class fields and methods
export class ModernComponent {
  #privateState = new Map();
  #initialized = false;

  constructor(data) {
    this.#privateState.set('data', data);
    this.#init();
  }

  #init() {
    this.#initialized = true;
    console.log('Component initialized with modern private fields');
  }

  get isReady() {
    return this.#initialized;
  }

  getData() {
    return this.#privateState.get('data');
  }
}

// 7. Optional chaining and nullish coalescing (ES2020)
export const safeAccess = (obj, path, defaultValue = null) => {
  return obj?.data?.nested?.value ?? defaultValue;
};

// 8. BigInt operations (ES2020)
export const largeMath = (a, b) => {
  return BigInt(a) * BigInt(b);
};

// 9. Dynamic imports
export const loadModule = async (moduleName) => {
  try {
    const module = await import(moduleName);
    return module;
  } catch (error) {
    console.warn(`Failed to load module ${moduleName}:`, error);
    return null;
  }
};

// 10. Modern async iterators
export async function* modernGenerator(data) {
  for (const item of data) {
    yield await processAsync(item);
  }
}

const processAsync = async (item) => {
  return new Promise(resolve => {
    setTimeout(() => resolve(item * 2), 10);
  });
};

// 11. Performance optimized functions using modern JS
export const optimizedArrayOperations = {
  // Using modern array methods
  partition: (array, predicate) => {
    const truthy = [];
    const falsy = [];
    for (const item of array) {
      (predicate(item) ? truthy : falsy).push(item);
    }
    return [truthy, falsy];
  },

  // Using Set for O(1) lookups
  uniqueBy: (array, keyFn) => {
    const seen = new Set();
    return array.filter(item => {
      const key = keyFn(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },

  // Using Map for efficient grouping
  groupByMap: (array, keyFn) => {
    const groups = new Map();
    for (const item of array) {
      const key = keyFn(item);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return groups;
  }
};

// 12. WeakMap for memory-efficient caching
const cache = new WeakMap();

export const memoizeWithWeakMap = (fn) => {
  return function(obj, ...args) {
    if (!cache.has(obj)) {
      cache.set(obj, new Map());
    }
    const objCache = cache.get(obj);
    const key = JSON.stringify(args);
    
    if (objCache.has(key)) {
      return objCache.get(key);
    }
    
    const result = fn.call(this, obj, ...args);
    objCache.set(key, result);
    return result;
  };
};

// 13. Modern Error handling with cause
export const createModernError = (message, originalError) => {
  return new Error(message, { cause: originalError });
};

// 14. Engine capability detection
export const engineCapabilities = {
  hasArrayGroupBy: typeof Array.prototype.groupBy === 'function',
  hasPromiseWithResolvers: typeof Promise.withResolvers === 'function',
  hasStringIsWellFormed: typeof String.prototype.isWellFormed === 'function',
  hasTemporal: typeof Temporal !== 'undefined',
  hasTopLevelAwait: true, // Always true in modules
  hasPrivateFields: true, // Supported in Node 22+
  nodeVersion: process.version,
  v8Version: process.versions.v8,
  
  report() {
    console.log('🚀 JavaScript Engine Capabilities:');
    Object.entries(this).forEach(([key, value]) => {
      if (typeof value !== 'function') {
        console.log(`  ${key}: ${value}`);
      }
    });
  }
};
