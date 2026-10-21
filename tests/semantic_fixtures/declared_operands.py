"""Unknown model identities, real source helper parameters and mixed boundaries."""
import torch
from torch import nn


def combine(zeta, alpha, middle):
    return zeta * torch.sigmoid(alpha) + middle


def reordered(middle, zeta, alpha):
    return zeta * torch.sigmoid(alpha) + middle


class ForeignColumns(nn.Module):
    def forward(self, x, y, z):
        a = torch.sin(x)
        b = torch.tanh(torch.cos(y))
        c = torch.relu(z)
        return combine(middle=c, alpha=b, zeta=a)


class ForeignDeclaration(nn.Module):
    def forward(self, x, y, z):
        a = torch.sin(x)
        b = torch.tanh(torch.cos(y))
        c = torch.relu(z)
        return reordered(middle=c, alpha=b, zeta=a)


class FragmentColumns(nn.Module):
    def forward(self, x, y, z):
        a = torch.sin(x)
        b = unavailable(y)
        c = torch.relu(z)
        return combine(middle=c, alpha=b, zeta=a)


class GuardedColumns(nn.Module):
    def forward(self, x, y, z, choose):
        a = torch.sin(x)
        b = torch.tanh(y)
        c = torch.relu(z)
        if choose:
            return combine(middle=c, alpha=b, zeta=a)
        return a


class SharedColumns(nn.Module):
    def forward(self, x, y, z):
        a = torch.sin(x)
        b = torch.tanh(y)
        c = torch.relu(z)
        result = combine(middle=c, alpha=b, zeta=a)
        return result, a


class MutableColumns(nn.Module):
    def forward(self, x, y, z):
        a = x.add_(z)
        b = torch.tanh(y)
        c = torch.relu(z)
        return combine(middle=c, alpha=b, zeta=a)


class MixedColumns(nn.Module):
    def __init__(self):
        super().__init__()
        self.foreign = ForeignColumns()
        self.fragment = FragmentColumns()
        self.cell = nn.RNN(8, 8, batch_first=True)

    def forward(self, x, y, z, state):
        a = self.foreign(x, y, z)
        b = self.fragment(x, y, z)
        sequence, hidden = self.cell(a.unsqueeze(1), state)
        return sequence.squeeze(1) + b, hidden
