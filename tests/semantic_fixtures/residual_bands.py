import torch
from torch import nn

def local_curve(x):
    a = torch.sin(x)
    b = torch.cos(a)
    c = torch.tanh(b)
    return torch.sigmoid(c)

class UnseenWorkshop(nn.Module):
    def forward(self, x, y, z):
        a = local_curve(x)
        b = torch.sin(y)
        c = torch.cos(z)
        d = b * c
        return a + d

class InterruptedWorkshop(nn.Module):
    def forward(self, x, y, z):
        a = local_curve(x)
        b = unavailable(y)
        c = torch.cos(z)
        return a + b * c

class ConditionalWorkshop(nn.Module):
    def forward(self, x, y, z, choose):
        a = local_curve(x)
        if choose:
            return a + y
        return a + z
