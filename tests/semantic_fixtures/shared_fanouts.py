import torch
from torch import nn

def distribute(x, y):
    a = x + y
    b = x * y
    c = x - y
    return a + b * c

def context_curve(y):
    a = torch.sin(y)
    b = torch.cos(a)
    return torch.tanh(b)

class UnseenDistribution(nn.Module):
    def forward(self, x, y):
        return distribute(torch.sin(x), context_curve(y))

class InterruptedDistribution(nn.Module):
    def forward(self, x, y, z):
        a = distribute(torch.sin(x), context_curve(y))
        return a + unavailable(z)

class ConditionalDistribution(nn.Module):
    def forward(self, x, y, choose):
        a = distribute(torch.sin(x), context_curve(y))
        if choose:
            return a
        return torch.sin(a)

class SharedDistribution(nn.Module):
    def __init__(self):
        super().__init__()
        self.shared = nn.Linear(4, 4)
    def forward(self, x, y):
        a = distribute(self.shared(x), context_curve(y))
        b = self.shared(y)
        return a + b

class MutableDistribution(nn.Module):
    def forward(self, x, y):
        a = distribute(torch.sin(x), context_curve(y))
        y.add_(x)
        return a + y
