/**
 * ===================================================================================
 * Cloudflare D1 Worker API for Portfolio Database (v3 - Secure & Robust)
 *
 * Features:
 * - Robust CORS pre-flight and response handling.
 * - Secure API routes for write operations (POST, PUT, DELETE) using a secret key.
 * - Clean, explicit routing for all database actions.
 * ===================================================================================
 */

export default {
    async fetch(request, env) {
        // --- CORS Pre-flight Handler ---
        // Immediately handle OPTIONS requests to allow cross-origin requests from your admin panel.
        if (request.method === 'OPTIONS') {
            return handleOptions(request, env);
        }

        try {
            // --- Authentication Middleware ---
            // Protect write methods (POST, PUT, DELETE)
            const writeMethods = ['POST', 'PUT', 'DELETE'];
            if (writeMethods.includes(request.method)) {
                const authHeader = request.headers.get('Authorization');
                if (!authHeader || authHeader !== `Bearer ${env.SECRET_KEY}`) {
                    return errorResponse('Unauthorized', 401);
                }
            }

            // --- Main API Router ---
            const url = new URL(request.url);
            
            if (url.pathname.startsWith('/api/')) {
                 return await handleApiRequest(url, request, env);
            }

            return errorResponse('Route not found', 404);

        } catch (e) {
            return errorResponse(e.message, 500);
        }
    }
};


/**
 * Handles all API requests routed from the main fetch handler.
 * @param {URL} url The request URL object.
 * @param {Request} request The original request.
 * @param {object} env The environment object.
 */
async function handleApiRequest(url, request, env) {
    const { pathname } = url;
    const db = env.DB;

    // GET /api/categories
    if (request.method === 'GET' && pathname === '/api/categories') {
        const { results } = await db.prepare("SELECT * FROM categories ORDER BY project_count DESC, category_name ASC").all();
        return jsonResponse(results);
    }
    
    // POST /api/categories
    if (request.method === 'POST' && pathname === '/api/categories') {
        const { name } = await request.json();
        const result = await db.prepare("INSERT INTO categories (category_name) VALUES (?)").bind(name).run();
        return jsonResponse(result, 201);
    }
    
    // GET /api/projects
    if (request.method === 'GET' && pathname === '/api/projects') {
        const includeHidden = url.searchParams.get('includeHidden') === 'true';
        const stmt = db.prepare("SELECT * FROM projects WHERE visibility = 1 OR ? ORDER BY order_number ASC, s_no DESC").bind(includeHidden);
        const { results } = await stmt.all();
        return jsonResponse(results);
    }

    // POST /api/projects
    if (request.method === 'POST' && pathname === '/api/projects') {
        const p = await request.json();
        const result = await db.prepare(
            "INSERT INTO projects (name, long_description, images, github_link, technologies, category_name, short_description, circuit_diagram_link, video_link, order_number, visibility) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(p.name, p.long_description, p.images, p.github_link, p.technologies, p.category_name, p.short_description, p.circuit_diagram_link, p.video_link, p.order_number, p.visibility).run();
        return jsonResponse(result, 201);
    }
    
    // Handle routes with an ID, like /api/projects/123
    const idMatch = pathname.match(/^\/api\/(projects|categories)\/(\d+)$/);
    if (idMatch) {
        const resourceType = idMatch[1]; // 'projects' or 'categories'
        const id = idMatch[2];

        if (request.method === 'PUT') {
            const body = await request.json();
            if (resourceType === 'projects') {
                const result = await db.prepare(
                    "UPDATE projects SET name=?, long_description=?, images=?, github_link=?, technologies=?, category_name=?, circuit_diagram_link=?, order_number=?, visibility=? WHERE s_no = ?"
                ).bind(body.name, body.long_description, body.images, body.github_link, body.technologies, body.category_name, body.circuit_diagram_link, body.order_number, body.visibility, id).run();
                return jsonResponse(result);
            }
             if (resourceType === 'categories') {
                const result = await db.prepare("UPDATE categories SET category_name = ? WHERE s_no = ?").bind(body.name, id).run();
                return jsonResponse(result);
            }
        }
        
        if (request.method === 'DELETE') {
            await db.prepare(`DELETE FROM ${resourceType} WHERE s_no = ?`).bind(id).run();
            return new Response(null, { status: 204 });
        }
    }

    return errorResponse('Route not found', 404);
}


// --- HELPER FUNCTIONS ---

/**
 * Handles CORS preflight (OPTIONS) requests.
 * @param {Request} request
 * @param {object} env
 */
function handleOptions(request, env) {
    const headers = {
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    return new Response(null, { headers });
}

/**
 * Creates a standard JSON success response with CORS headers.
 * @param {object} data The data payload.
 * @param {number} status The HTTP status code.
 * @param {object} env The environment object.
 */
function jsonResponse(data, status = 200, env) {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    };
    return new Response(JSON.stringify(data), { status, headers });
}

/**
 * Creates a standard JSON error response with CORS headers.
 * @param {string} message The error message.
 * @param {number} status The HTTP status code.
 * @param {object} env The environment object.
 */
function errorResponse(message, status = 400, env) {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    };
    return new Response(JSON.stringify({ error: message }), { status, headers });
}