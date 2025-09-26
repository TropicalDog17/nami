describe('Admin Functionality', () => {
  beforeEach(() => {
    cy.visit('/admin')
  })

  it('should display admin panel interface', () => {
    cy.get('h2').should('contain.text', 'Admin Panel')
    cy.contains('Manage transaction types, accounts, assets, and tags').should('be.visible')
  })

  it('should show all management cards', () => {
    // Check Transaction Types management
    cy.contains('Transaction Types').should('be.visible')
    cy.contains('Manage configurable transaction categories').should('be.visible')
    cy.get('button').contains('Manage Types').should('be.visible').and('not.be.disabled')
    
    // Check Accounts management
    cy.contains('Accounts').should('be.visible')
    cy.contains('Manage cash, bank, and investment accounts').should('be.visible')
    cy.get('button').contains('Manage Accounts').should('be.visible').and('not.be.disabled')
    
    // Check Assets management
    cy.contains('Assets').should('be.visible')
    cy.contains('Manage currencies and tokens').should('be.visible')
    cy.get('button').contains('Manage Assets').should('be.visible').and('not.be.disabled')
    
    // Check Tags management
    cy.contains('Tags').should('be.visible')
    cy.contains('Manage categorization tags').should('be.visible')
    cy.get('button').contains('Manage Tags').should('be.visible').and('not.be.disabled')
  })

  it('should have working management buttons', () => {
    // Test all management buttons
    cy.get('button').contains('Manage Types').click()
    cy.get('button').contains('Manage Accounts').click()
    cy.get('button').contains('Manage Assets').click()
    cy.get('button').contains('Manage Tags').click()
    
    // Verify buttons are still enabled after clicking
    cy.get('button').contains('Manage Types').should('not.be.disabled')
  })

  it('should have proper card layout', () => {
    // Check that we have 4 management cards
    cy.get('.card').should('have.length', 4)
    
    // Check grid layout
    cy.get('[class*="grid"]').should('exist')
    cy.get('[class*="gap"]').should('exist')
  })

  it('should be responsive', () => {
    // Test different screen sizes
    cy.viewport(1280, 720) // Desktop
    cy.get('.card').should('have.length', 4)
    
    cy.viewport(768, 1024) // Tablet
    cy.get('.card').should('have.length', 4)
    
    cy.viewport(375, 667) // Mobile
    cy.get('.card').should('have.length', 4)
  })
})
