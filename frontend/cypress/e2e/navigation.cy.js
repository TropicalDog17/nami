describe('Navigation Tests', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('should load the homepage correctly', () => {
    cy.title().should('include', 'Nami')
    cy.get('h1').should('contain.text', 'Nami')
    cy.get('nav').should('be.visible')
  })

  it('should navigate between all pages', () => {
    // Start on Transactions page
    cy.get('h2').should('contain.text', 'Transaction Management')
    cy.checkActiveNavigation('Transactions')
    
    // Navigate to Admin page
    cy.contains('nav a', 'Admin').click()
    cy.get('h2').should('contain.text', 'Admin Panel')
    cy.checkActiveNavigation('Admin')
    cy.url().should('include', '/admin')
    
    // Navigate to Reports page
    cy.contains('nav a', 'Reports').click()
    cy.get('h2').should('contain.text', 'Reports & Analytics')
    cy.checkActiveNavigation('Reports')
    cy.url().should('include', '/reports')
    
    // Navigate back to Transactions
    cy.contains('nav a', 'Transactions').click()
    cy.get('h2').should('contain.text', 'Transaction Management')
    cy.checkActiveNavigation('Transactions')
    cy.url().should('eq', Cypress.config().baseUrl + '/')
  })

  it('should have responsive navigation', () => {
    // Test navigation visibility on different screen sizes
    cy.viewport(1280, 720) // Desktop
    cy.get('nav').should('be.visible')
    
    cy.viewport(768, 1024) // Tablet
    cy.get('nav').should('be.visible')
    
    cy.viewport(375, 667) // Mobile
    cy.get('nav').should('be.visible')
  })
})
