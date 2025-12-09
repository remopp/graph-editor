# Graph Editor

**Live Demo:** [mopgraph.site](http://mopgraph.site)

A comprehensive, web-based graph visualization and analysis platform. This application allows users to create, edit, share, and analyze complex network graphs directly in the browser. It features real-time force-directed layouts, hierarchical visualization, and built-in analytics algorithms.

![Project Status](https://img.shields.io/badge/status-live-success) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## 🚀 Skills & Architecture Demonstrated

This project serves as a demonstration of **Full Stack Development** and **Cloud Infrastructure** competencies. Beyond the application logic, the deployment architecture was built from scratch to ensure scalability and portability.

### Cloud Infrastructure & DevOps
* **Google Cloud Platform (GCP):** Provisioned and managed a Compute Engine Virtual Machine (VM) to host the production environment.
* **Containerization (Docker):** Authored a production-ready `Dockerfile` to containerize the Node.js application, ensuring environment consistency between local development and the cloud server.
* **Domain & DNS Management:** Purchased and configured a custom domain (`mopgraph.site`), managing DNS records to resolve correctly to the cloud instance's IP address.

### Backend Engineering & Database
* **RESTful API:** Built a robust API using **Node.js** and **Express** to handle graph CRUD operations and sharing permissions.
* **MongoDB Implementation:** Utilized MongoDB's document-oriented (NoSQL) structure to efficiently store complex, nested graph data. By storing nodes and links as arrays within a single document, the application achieves fast read/write performance without the need for complex SQL joins.
* **Data Integrity:** Validated incoming data payloads to ensure that graph nodes and edges adhere to the required structure before persistence.

### Security & Privacy Features
* **Password Hashing:** User credentials are secured using **Bcrypt**. Passwords are salted and hashed immediately upon registration, ensuring that plain-text passwords are never stored in the database. This protects user privacy even in the event of a data breach.
* **Token-Based Authentication (JWT):** Implemented a stateless session system using **JSON Web Tokens**.
  * Upon successful login, the server issues a signed JWT containing the user's ID.
  * The client stores this token and attaches it to the `Authorization` header of subsequent requests.
  * Middleware validates this token on every protected route to ensure only authorized users can access or modify their data.

### Frontend & Visualization
* **Interactive Visualization:** Utilized **D3.js (v7)** to build a high-performance rendering engine supporting zooming, panning, and dragging of nodes.
* **Algorithm Implementation:** Implemented graph theory algorithms in JavaScript, including **Dijkstra’s Algorithm** for shortest path finding and **PageRank** for centrality analysis.
* **State Management:** Designed a central state management system to handle undo/redo history stacks and selection logic without external frameworks.

---

## ✨ Key Features

* **Multi-Layout Visualization:** Support for Force-Directed and Hierarchical (Top-Down).
* **Graph Analytics:**
  * **Shortest Path:** Calculate and highlight the most efficient path between two nodes.
  * **Centrality Measures:** Compute Degree Centrality and PageRank to identify key nodes.
* **Collaboration:** Share graphs with other users with specific access roles (`viewer` or `editor`).
* **Import/Export:** Support for importing CSV data and exporting graphs as CSV or PNG images.
* **Search & Filtering:** Real-time search functionality to locate nodes by ID or Label.

---

## 🛠️ Technology Stack

| Category | Technology |
| :--- | :--- |
| **Frontend** | HTML5, CSS3, Vanilla JavaScript (ES Modules), D3.js |
| **Backend** | Node.js, Express.js |
| **Database** | MongoDB |
| **Authentication** | JWT, Bcrypt.js |
| **Infrastructure** | Docker, Google Cloud VM, Nginx |
