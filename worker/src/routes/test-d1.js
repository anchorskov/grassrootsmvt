// worker/src/routes/test-d1.js
// Simple D1 connectivity test

export default {
  path: '/api/test-d1',
  method: 'GET',
  async handler(req, env) {
    const tests = [];
    
    // Test 1: Check if D1 is available
    tests.push({
      test: 'D1 Binding Available',
      result: !!env.d1,
      value: env.d1 ? 'Available' : 'Not Available'
    });
    
    // Test 2: Check environment
    tests.push({
      test: 'Environment',
      result: true,
      value: env.ENVIRONMENT || 'undefined'
    });
    
    // Test 3: Try a simple query
    if (env.d1) {
      try {
        const result = await env.d1.prepare('SELECT 1 as test').first();
        tests.push({
          test: 'Simple Query',
          result: true,
          value: result ? 'Success' : 'No result'
        });
      } catch (err) {
        tests.push({
          test: 'Simple Query',
          result: false,
          value: err.message
        });
      }
      
      // Test 4: Check if voters table exists
      try {
        const tables = await env.d1.prepare(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name LIKE '%voter%'
        `).all();
        tests.push({
          test: 'Voter Tables Found',
          result: tables.results.length > 0,
          value: tables.results.map(t => t.name).join(', ') || 'None'
        });
      } catch (err) {
        tests.push({
          test: 'Voter Tables Found',
          result: false,
          value: err.message
        });
      }
      
      // Test 5: Try to count voters if table exists
      try {
        const count = await env.d1.prepare('SELECT COUNT(*) as count FROM voters').first();
        tests.push({
          test: 'Voters Count',
          result: true,
          value: count ? count.count : 'No data'
        });
      } catch (err) {
        tests.push({
          test: 'Voters Count',
          result: false,
          value: err.message
        });
      }
    }
    
    return new Response(JSON.stringify({
      ok: true,
      timestamp: new Date().toISOString(),
      tests
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  },
};