# Florida State RP Website

A modern, sleek website for the Florida State RP community featuring smooth animations, transitions, and Firebase integration for event management, forms, and project management.

## Features

### Current Features
- Modern, responsive design with smooth animations
- Scroll-triggered fade-in effects
- 3D card hover effects with parallax
- Mobile-friendly navigation with hamburger menu
- Sections for:
  - Hero landing page
  - About the community
  - Events showcase
  - Department information
  - Join/Application section
  - Contact information

### Design Elements
- Dark theme with gold/orange accents matching the FSRP logo
- Gradient text effects
- Smooth transitions and micro-interactions
- Parallax scrolling effects
- Cursor glow effect
- Button ripple animations
- Card tilt effects on hover

### Planned Features (Firebase Integration)
- Event management system
  - Event creation and registration
  - Calendar integration
  - Attendance tracking
- Project management system
  - Task tracking
  - Team collaboration
  - Progress monitoring
- Forms system
  - Complaint forms
  - DPS (Department of Public Safety) forms
  - Application forms
- Department rosters
  - Member management
  - Role assignments
  - Activity tracking
- User authentication
  - Login/Registration
  - User profiles
  - Permission levels

## Tech Stack

- **HTML5** - Semantic markup
- **CSS3** - Modern styling with animations
- **JavaScript (ES6+)** - Interactive functionality
- **Firebase** - Backend services
  - Authentication
  - Firestore Database
  - Cloud Storage
  - Analytics

## Getting Started

### Prerequisites
- Modern web browser
- Text editor (VS Code recommended)
- Node.js and npm (for Firebase SDK)

### Installation

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

3. For quick local testing (no build required):
```bash
npm run serve
```
Then open http://localhost:8000 in your browser

4. For development with Vite (recommended):
```bash
npm run dev
```

5. For production build:
```bash
npm run build
```

## File Structure

```
Florida State RP/
├── index.html              # Main HTML structure
├── styles.css             # All styling and animations
├── script.js              # Interactive functionality
├── firebase-config.js     # Firebase configuration
├── package.json           # Dependencies and scripts
├── FSRP.png              # Community logo
└── README.md             # This file
```

## Customization

### Adding Images
Replace the placeholder sections with your images:
- Hero background: Add your image in the `.hero-background` section
- Community image: Replace `.image-placeholder` in the About section
- Department images: Add icons or photos to department cards

### Updating Content
- Edit text in [index.html](index.html) for all sections
- Modify colors in [styles.css](styles.css) `:root` variables
- Adjust animations by tweaking CSS keyframes and transitions

### Firebase Setup
1. The Firebase configuration is already set up in [firebase-config.js](firebase-config.js)
2. To add authentication, import `auth` and use Firebase Auth methods
3. To add database functionality, import `db` and use Firestore methods
4. To add file uploads, import `storage` and use Storage methods

Example usage:
```javascript
import { auth, db, storage } from './firebase-config.js';
```

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Design Inspiration

This website incorporates 2026 web design trends:
- Functional animations that enhance usability
- Micro-interactions for user feedback
- Scroll-triggered animations
- Performance-first approach
- Dark themes with vibrant accents
- 3D transitions and spatial effects

## Future Enhancements

### Phase 1 (Short-term)
- Complete Firebase authentication system
- Event registration forms with database integration
- User dashboard

### Phase 2 (Mid-term)
- Project management dashboard
- Department roster management
- Complaint and feedback forms
- Admin panel

### Phase 3 (Long-term)
- Real-time chat integration
- Advanced analytics dashboard
- Mobile app (React Native)
- Community forums

## Contributing

This is a community project. To contribute:
1. Make your changes
2. Test thoroughly
3. Submit for review

## Support

For questions or issues:
- Email: contact@flstaterp.com
- Discord: Join our community server

## License

MIT License - Feel free to use and modify for your community

---

Built with passion for the Florida State RP community
