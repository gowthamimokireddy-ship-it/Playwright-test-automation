Feature: Checkout flow
  As a logged-in user
  I want to search, add a product to cart and complete checkout

  Scenario: Login, purchase a product and view orders
    Given I am logged in
    When I search for the product and complete checkout
    Then I should see my account link and the order processed message (if any)
